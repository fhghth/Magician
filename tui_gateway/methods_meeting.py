"""Meeting-room RPC handlers wired into the TUI gateway (M1.5 walking skeleton).

Adds ``meeting.create`` / ``meeting.status`` so a desktop conversation can
start a meeting, watch seats speak through the existing ``message.*`` pipeline,
and receive the durable conclusion back in the originating thread.

Design mirrors methods_session.py: handlers are rebound onto server.py's
globals at install time (method_ctx.py), so they close over the server module
only. The heavy lifting (per-seat ``AIAgent`` construction, scheduler loop,
products finalize) runs in a daemon thread OUTSIDE the request path — building
a seat agent can block for seconds (MCP discovery, skills, init_agent), and
the meeting itself runs long after ``meeting.create`` has answered.

Event routing: every seat ``message.*`` and meeting ``meeting.*`` frame is
stamped with the ORIGIN session id (the conversation that opened the room), so
``write_json`` targets the origin session's transport and the desktop routes
the frame to the owning conversation — no session-less frames that
gateway-events.ts would drop. The origin is a convenience, not a requirement:
a room started with no source conversation stamps its frames with a synthetic
``meeting:<mid>`` id and delivers them through the creating request's
transport, so the desktop can still attribute them.

Seats are quiet: their per-turn visual callbacks (tool/thinking/status) are
nulled after construction so a room full of agents doesn't spam the origin
view. Only the TurnRunner's ``message.*`` stream surfaces (reused by the
desktop's existing message pipeline), plus the ``meeting.*`` metadata frames.
"""

from __future__ import annotations

import contextvars
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .method_ctx import HandlerRegistry

_registry = HandlerRegistry()
method = _registry.method
_profile_scoped = _registry.profile_scoped

# Live meeting handles: meeting_id -> handle. Populated by meeting.create and
# updated by the driver thread; read by meeting.status. The handle carries the
# origin sid / session key so the bus builder and thread bookkeeping never
# touch a server-side lock.
_HANDLES: Dict[str, Dict[str, Any]] = {}
_HANDLES_LOCK = threading.Lock()

# Default when a caller provides neither budgets nor an explicit turn ceiling:
# a small number of rounds so a demo meeting converges in seconds without
# budget guards. Callers that pass budgets (or max_rounds) govern normally.
_DEFAULT_DEMO_MAX_ROUNDS = 4

# Seat-agent attributes cemented by init_agent that would emit per-seat visual
# chatter (tool progress, thinking, status …) into the origin conversation.
# Nulled after construction so seats stay silent — the TurnRunner mirrors only
# the final streamed reply onto ``message.*``.
_SEAT_QUIET_ATTRS = (
    "tool_progress_callback",
    "tool_start_callback",
    "tool_complete_callback",
    "tool_gen_callback",
    "thinking_callback",
    "reasoning_callback",
    "clarify_callback",
    "read_terminal_callback",
    "step_callback",
    "stream_delta_callback",
    "interim_assistant_callback",
    "status_callback",
    "notice_callback",
    "notice_clear_callback",
    "event_callback",
    "reaction_callback",
)


def register(server) -> None:
    """Bind this module's handlers onto ``server``'s globals and registry."""
    _registry.install(server)


@method("meeting.create")
def _(rid, params: dict) -> dict:
    topic = str(params.get("topic") or "").strip()
    if not topic:
        return _err(rid, 4005, "meeting topic is required")

    mode = str(params.get("mode") or "light").strip() or "light"
    budget_rounds = _int_or_none(params.get("budget_rounds"))
    budget_seconds = _int_or_none(params.get("budget_seconds"))
    budget_tokens = _int_or_none(params.get("budget_tokens"))
    raw_max_rounds = _int_or_none(params.get("max_rounds"))
    # Default demo ceiling: without budgets and without an explicit ceiling,
    # converge after a few rounds so a walkthrough lands in seconds.
    max_rounds = raw_max_rounds
    if max_rounds is None and budget_rounds is None and budget_seconds is None and budget_tokens is None:
        max_rounds = _DEFAULT_DEMO_MAX_ROUNDS

    raw_seats = params.get("seats")
    if not isinstance(raw_seats, list) or not raw_seats:
        seat_specs = _default_seat_specs(topic)
    else:
        seat_specs = _coerce_seat_specs(raw_seats, topic)

    # The origin conversation is resolved once and never fails: any id the
    # caller submits (runtime sid, durable key, stored row, other profile, or
    # nothing at all) yields a room.
    mid = uuid.uuid4().hex[:12]
    origin = _meeting_origin(params, mid)

    # Seats inherit the origin conversation's model/provider pick so the room
    # voices the same runtime the user already chose. A standalone room (no
    # origin conversation) falls through the same ladder to the meeting default
    # in config.yaml ``meeting.model``, then to the runtime's global model.
    model_override = origin["model_override"]
    provider_override = origin["provider_override"]
    if isinstance(model_override, dict):
        provider_override = model_override.get("provider") or provider_override
    else:
        # Ladder rung below the session pick: the configured meeting default
        # (config.yaml ``meeting.model`` — the Settings page editor). Only
        # consulted when the origin carries no override, so a /model switch
        # still wins over the meeting default.
        try:
            model_override, provider_override = _resolve_meeting_model_override(
                model_override, (dict(_load_cfg().get("meeting") or {}).get("model") or {})
            )
        except Exception:
            pass

    handle: Dict[str, Any] = {
        "meeting_id": mid,
        "origin_sid": origin["sid"],
        "session_key": origin["session_key"],
        "cwd": origin["cwd"] or _completion_cwd(params),
        "profile_home": origin["profile_home"],
        "topic": topic,
        "mode": mode,
        "budget_rounds": budget_rounds,
        "budget_seconds": budget_seconds,
        "budget_tokens": budget_tokens,
        "max_rounds": max_rounds,
        "model_override": model_override,
        "provider_override": provider_override,
        "seat_specs": seat_specs,
        "source": origin["source"],
        "standalone": origin["standalone"],
        "status": "created",
        "error": None,
        "summary": None,
        "packet": None,
        "_store": None,
        "_db": None,
        "created_at": time.time(),
    }
    with _HANDLES_LOCK:
        _HANDLES[mid] = handle

    # Drive the whole room on its own daemon thread. copy_context() lets the
    # driver inherit the request contextvar bindings (transport, profile home
    # overrides) just like a delegate child does — the thread then routes all
    # frames through the same transport the caller sees.
    ctx = contextvars.copy_context()

    def _driver() -> None:
        try:
            _run_meeting(handle)
        finally:
            _close_handle(handle)

    threading.Thread(
        target=lambda: ctx.run(_driver),
        daemon=True,
        name=f"meeting-{mid[:8]}",
    ).start()

    return _ok(
        rid,
        {
            "meeting_id": mid,
            "topic": topic,
            "mode": mode,
            "status": "created",
            "origin_sid": origin["sid"],
            "standalone": origin["standalone"],
            "seats": [
                {"seat_id": s["seat_id"], "name": s["name"], "role": s["role"]}
                for s in seat_specs
            ],
            "budgets": {
                "rounds": budget_rounds,
                "seconds": budget_seconds,
                "tokens": budget_tokens,
            },
        },
    )


@method("meeting.status")
def _(rid, params: dict) -> dict:
    mid = str(params.get("meeting_id") or params.get("id") or "").strip()
    with _HANDLES_LOCK:
        handle = _HANDLES.get(mid)
    if handle is None:
        return _err(rid, 4004, "meeting not found")
    return _ok(rid, _status_payload(mid))


# ── origin resolution (meeting.create) ───────────────────────────────────────
# The origin conversation is a convenience, never a requirement. The meeting
# must start even when the caller's ``session_id`` does not name anything the
# server currently knows — and even when the caller sends no session_id at all.


def _meeting_origin(params: dict, mid: str) -> Dict[str, Any]:
    """Resolve the meeting's origin conversation — or stand alone.

    Returns a plain dict (never an error), so ``meeting.create`` always
    succeeds as long as the topic is present. Resolution ladder, first hit
    wins:

    1. ``session_id`` names a live runtime session (``_sessions`` sid key).
    2. ``session_id`` is the durable key of a live session
       (``_find_live_session_by_key``) — the common case, since the desktop
       submits the id from its session list, which is the durable key, while
       ``_sessions`` is keyed by a separate runtime sid. The old bare
       ``_sess_nowait`` lookup made every resumably conversation hard-fail
       "session not found".
    3. ``session_id`` resolves to a stored row — in the launch profile, or in
       ``params.profile`` (app-global remote mode) — following the compression
       lineage to the live tip, exactly like ``session.resume``.
    4. Nothing resolves (or no ``session_id`` at all) — standalone room.

    Frames are stamped with ``origin_sid``: the durable key for real origins,
    and a synthetic ``meeting:<mid>`` id for standalone rooms. The desktop
    attributes ``meeting.*`` frames by this id, so it must be stable and
    non-empty.
    """
    sid = str(params.get("session_id") or "").strip()
    if not sid:
        return _standalone_origin(mid)

    # 1. Live runtime session.
    session = _sessions.get(sid)
    if session is not None:
        return _origin_from_live(session, mid)

    # 2. Durable key of a live session.
    try:
        live = _find_live_session_by_key(sid)
    except Exception:
        live = None
    if live is not None:
        return _origin_from_live(live[1], mid, sid)

    # 3. Stored row (launch profile, or the requested profile's db).
    row, profile_home = _meeting_stored_row(sid, (params.get("profile") or "").strip() or None)
    if row is None:
        # 4. Nothing resolved — standalone.
        return _standalone_origin(mid)

    # Follow the compression-continuation chain to the live tip so the room
    # binds to the descendant that actually holds the current turns (mirrors
    # session.resume). The tip may itself be live — rebind in that case.
    tip_key = sid
    try:
        if profile_home is not None:
            from hermes_state import SessionDB

            tip_db = SessionDB(db_path=Path(str(profile_home)) / "state.db")
            try:
                tip = tip_db.resolve_resume_session_id(sid)
            finally:
                tip_db.close()
        else:
            tip_db = _get_db()
            tip = tip_db.resolve_resume_session_id(sid) if tip_db is not None else None
    except Exception:
        tip = None
    if tip and tip != sid:
        tip_key = tip
        try:
            live = _find_live_session_by_key(tip_key)
        except Exception:
            live = None
        if live is not None:
            return _origin_from_live(live[1], mid, tip_key)

    return _origin_from_row(row, mid, tip_key, profile_home)


def _origin_from_live(session: Dict[str, Any], mid: str, key: str = "") -> Dict[str, Any]:
    """Origin dict from a live ``_sessions`` record, stamped with its durable key."""
    key = key or str(session.get("session_key") or "")
    return {
        "sid": key or f"meeting:{mid}",
        "session_key": key or None,
        "live": True,
        "standalone": not key,
        "cwd": session.get("cwd"),
        "profile_home": session.get("profile_home"),
        "source": session.get("source"),
        "model_override": session.get("model_override"),
        "provider_override": None,
    }


def _origin_from_row(
    row: Dict[str, Any], mid: str, key: str, profile_home: Optional[str]
) -> Dict[str, Any]:
    """Origin dict from a stored session row, restoring its runtime model pick."""
    overrides: Dict[str, Any] = {}
    try:
        overrides = _stored_session_runtime_overrides(row)
    except Exception:
        pass
    return {
        "sid": key,
        "session_key": key,
        "live": False,
        "standalone": False,
        "cwd": row.get("cwd"),
        "profile_home": profile_home,
        "source": row.get("source"),
        "model_override": overrides.get("model_override"),
        "provider_override": overrides.get("provider_override"),
    }


def _standalone_origin(mid: str) -> Dict[str, Any]:
    """Origin dict for a room with no origin conversation at all."""
    return {
        "sid": f"meeting:{mid}",
        "session_key": None,
        "live": False,
        "standalone": True,
        "cwd": None,
        "profile_home": None,
        "source": None,
        "model_override": None,
        "provider_override": None,
    }


def _meeting_stored_row(sid: str, profile: Optional[str]) -> Tuple[Optional[dict], Optional[str]]:
    """Locate a stored session row for ``sid`` → (row, profile_home).

    Searches the launch profile's state.db, or ``profile``'s when the caller
    explicitly names one (app-global remote mode). ``profile_home`` is None for
    the launch db and the owning home path otherwise — the driver opens that
    db so the meeting row and the conclusion card land in the origin's profile.
    """
    if profile:
        home = _profile_home(profile)
        if home is None:
            return None, None
        try:
            from hermes_state import SessionDB

            db = SessionDB(db_path=Path(str(home)) / "state.db")
        except Exception:
            return None, None
        try:
            return db.get_session(sid), str(home)
        except Exception:
            return None, None
        finally:
            db.close()
    db = _get_db()
    if db is None:
        return None, None
    try:
        return db.get_session(sid), None
    except Exception:
        return None, None


# ── driver (runs on the meeting thread, off the request path) ───────────────


def _run_meeting(h: Dict[str, Any]) -> None:
    """Create the row, build the seats, run the scheduler, finalize, close."""
    from agent.meeting.scheduler import MeetingScheduler
    from agent.meeting.seat import Seat
    from agent.meeting.store import MeetingStore
    from agent.meeting.engine import register_engine, unregister_engine

    mid = h["meeting_id"]
    origin_sid = h["origin_sid"]
    origin_key = h["session_key"]
    db = None
    close_db = False
    home_token = secret_token = None
    store: Optional[MeetingStore] = None
    from agent.meeting.engine import MeetingEngine

    engine: Optional[MeetingEngine] = None
    try:
        profile_home = h["profile_home"]
        if profile_home:
            home_token = set_hermes_home_override(profile_home)
            secret_token = set_secret_scope(
                build_profile_secret_scope(Path(str(profile_home)))
            )
            from hermes_state import SessionDB

            db = SessionDB(db_path=Path(str(profile_home)) / "state.db")
            close_db = True
        else:
            db = _get_db()
        if db is None:
            raise RuntimeError("no session database available for meeting")
        h["_db"] = db

        store = MeetingStore(db)
        h["_store"] = store
        store.create_meeting(
            meeting_id=mid,
            origin_ref=f"thread:{origin_key}" if origin_key else None,
            topic=h["topic"],
            mode=h["mode"],
            budget_rounds=h["budget_rounds"],
            budget_seconds=h["budget_seconds"],
            budget_tokens=h["budget_tokens"],
        )
        engine = MeetingEngine(store, mid)
        register_engine(engine)

        # Bind the desk context so turnout env resolution + the fallback
        # transport mirror the origin session. ui_session_id is the sid the
        # client knows; the session-key override just anchors env vars. A
        # standalone room anchors on its synthetic meeting id.
        tokens = _set_session_context(origin_key or origin_sid, h["cwd"], ui_session_id=origin_sid)
        try:
            # The write-back card lands in the origin thread, which needs a
            # durable row for products.finalize's append_message to have a home.
            # Standalone rooms have no origin thread — skip the row entirely.
            if origin_key:
                _ensure_session_db_row(
                    _sessions.get(origin_sid)
                    or {"session_key": origin_key, "profile_home": h.get("profile_home")}
                )

            def _bus(event_type: str, payload: Dict[str, Any]) -> None:
                _emit(event_type, origin_sid, payload)

            seats: List[Seat] = []
            for spec in h["seat_specs"]:
                seat_id = spec["seat_id"]
                seat_key = f"meeting:{mid}:{seat_id}"
                seat = Seat(
                    meeting_id=mid,
                    seat_id=seat_id,
                    role=spec["role"],
                    name=spec["name"],
                    objective=spec["objective"],
                    agent_factory=_seat_agent_factory(h, seat_key, origin_key),
                )
                seats.append(seat)
                # Eagerly materialize so a stale/missing provider surfaces as a
                # clear meeting error before the scheduler burns a turn budget.
                try:
                    seat.ensure_agent()
                except Exception as exc:
                    raise RuntimeError(f"seat {seat_id} build failed: {exc}") from exc

            scheduler = MeetingScheduler(
                engine, seats, stream_emit=_bus, max_rounds=h["max_rounds"]
            )
            h["status"] = "running"
            summary = scheduler.run()
            h["summary"] = summary

            from agent.meeting.products import MeetingProducts

            products = MeetingProducts(engine)
            packet = products.finalize()
            engine.close(actor="system.meeting_driver")
            h["packet"] = packet.as_dict()
            # products.finalize() appends to the durable meeting_events stream but
            # not to the live bus; mirror the conclusion frame so the room's
            # desktop projection updates immediately.
            _bus("meeting.conclusion", packet.as_dict())
            h["status"] = "closed"
        finally:
            # The driver thread's copy_context inherited the request's bindings;
            # drop the meeting's own session-key/cwd override when it exits.
            try:
                _clear_session_context(tokens)
            except Exception:
                pass
    except Exception as exc:
        h["error"] = f"{type(exc).__name__}: {exc}"
        h["status"] = "aborted"
        if engine is not None:
            try:
                engine.abort(actor="system.meeting_driver")
            except Exception:
                pass
    finally:
        try:
            unregister_engine(mid)
        except Exception:
            pass
        if close_db and db is not None:
            try:
                db.close()
            except Exception:
                pass
        if profile_home:
            try:
                if home_token is not None:
                    reset_hermes_home_override(home_token)
            except Exception:
                pass
            try:
                if secret_token is not None:
                    reset_secret_scope(secret_token)
            except Exception:
                pass


def _resolve_meeting_model_override(
    session_override: Any, meeting_model_cfg: Optional[Dict[str, Any]] = None
) -> Tuple[Any, Optional[str]]:
    """Resolve a meeting seat's model ladder against the configured default.

    Rung semantics: a live session override (from /model or the desktop
    orchestrator/config.set) is authoritative and returned unchanged with its
    provider. When the session has none, the config.yaml ``meeting.model``
    block (edited from Settings → 会议) supplies ``provider``/``default``;
    an empty config falls through to ``(None, None)`` so the runtime's global
    model resolution applies. Pure helper — testable without the gateway
    server installation.
    """
    if session_override:
        provider = None
        if isinstance(session_override, dict):
            provider = session_override.get("provider")
        return session_override, provider

    if not isinstance(meeting_model_cfg, dict):
        return None, None
    model = str(meeting_model_cfg.get("default") or "").strip()
    if not model:
        return None, None
    provider = str(meeting_model_cfg.get("provider") or "").strip() or None
    override: Dict[str, Any] = {"model": model}
    if provider:
        override["provider"] = provider
    return override, provider


def _seat_agent_factory(h: Dict[str, Any], seat_key: str, parent_sid: str):
    """Zero-arg factory the Seat calls on first turn to materialize its agent."""

    def _build() -> Any:
        seat_sid = uuid.uuid4().hex[:8]
        agent = _make_agent(
            seat_sid,
            seat_key,
            session_id=seat_key,
            session_db=h.get("_db"),
            model_override=h.get("model_override"),
            provider_override=h.get("provider_override"),
            platform_override=h.get("source"),
        )
        _quiet_seat_agent(agent)
        try:
            agent._parent_session_id = parent_sid
        except Exception:
            pass
        return agent

    return _build


def _quiet_seat_agent(agent: Any) -> None:
    """Null the per-turn visual callbacks so seats don't spam the origin view."""
    for name in _SEAT_QUIET_ATTRS:
        if hasattr(agent, name):
            try:
                setattr(agent, name, None)
            except Exception:
                pass


def _status_payload(mid: str) -> dict:
    with _HANDLES_LOCK:
        h = _HANDLES.get(mid)
    if h is None:
        return {"meeting_id": mid, "status": "missing"}
    store = h.get("_store")
    try:
        row = store.get_meeting(mid) if store is not None else None
    except Exception:
        row = None
    summary = h.get("summary") or {}
    packet = h.get("packet")
    return {
        "meeting_id": mid,
        "topic": h["topic"],
        "mode": h["mode"],
        "status": h.get("status"),
        "db_status": (row or {}).get("status"),
        "error": h.get("error"),
        "seats": [s["seat_id"] for s in h["seat_specs"]],
        "turns": summary.get("turns") if isinstance(summary, dict) else None,
        "exhausted": summary.get("exhausted") if isinstance(summary, dict) else None,
        "stats": (packet or {}).get("stats") if isinstance(packet, dict) else None,
        "created_at": h.get("created_at"),
    }


def _close_handle(handle: Dict[str, Any]) -> None:
    with _HANDLES_LOCK:
        # Keep the finished handle around for meeting.status; the row is the
        # durable record, this entry is just a live/very-recent mirror.
        _HANDLES[handle["meeting_id"]] = handle


def _int_or_none(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        v = int(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _coerce_seat_specs(raw: List[Any], topic: str) -> List[dict]:
    specs: List[dict] = []
    for i, s in enumerate(raw):
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or f"席位{i + 1}").strip()
        role = str(s.get("role") or "member").strip() or "member"
        objective = str(s.get("objective") or "").strip()
        specs.append(
            {
                "seat_id": f"seat{i + 1}",
                "name": name,
                "role": role,
                "objective": objective or name,
            }
        )
    return specs or _default_seat_specs(topic)


def _default_seat_specs(topic: str) -> List[dict]:
    """Default three-voiced room for an unseeded meeting.create."""
    return [
        {
            "seat_id": "seat1",
            "name": "协调者",
            "role": "facilitator",
            "objective": f"主持讨论《{topic}》，推动结论收敛",
        },
        {
            "seat_id": "seat2",
            "name": "提出者",
            "role": "advocate",
            "objective": f"为《{topic}》提出并论证核心方案",
        },
        {
            "seat_id": "seat3",
            "name": "质疑者",
            "role": "critic",
            "objective": f"从风险与可行性角度质疑并补全《{topic}》",
        },
    ]