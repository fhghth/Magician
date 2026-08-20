"""Agent-preset JSON-RPC handlers for the TUI/desktop gateway.

Mirrors the classic CLI's `/preset` semantics (see
``hermes_cli/cli_commands_mixin.py::_handle_preset_command``) over the wire:

- ``preset.list`` — every discoverable preset (built-in + user, first-root
  wins) plus the profile default, so the desktop can render a picker.
- ``preset.apply`` — switch a session's preset. The switch is persisted to
  the session row (``sessions.agent_preset``) AND, when the session holds a
  live agent, recomposes that agent immediately — next turn runs the new
  composition (persona + tools), conversation history preserved. This is the
  desktop's recompose equivalent of the CLI's ``self.agent = None`` path,
  kept in line with the deepseek-harness mount/recompose semantics the CLI
  side already follows.

  The harness blank-session rule applies: a preset may only be swapped while
  the session is still blank (no messages yet). Once the conversation has
  content, the composition is fixed — swapping tools mid-conversation would
  leave logged tool calls the new composition cannot make. Busy sessions and
  sessions with history are rejected (4009 / 4010).

Handler bodies are rebound onto server.py's globals at install time — see
method_ctx.py.
"""

from .method_ctx import HandlerRegistry

_registry = HandlerRegistry()
method = _registry.method


def _preset_to_dict(preset) -> dict:
    return {
        "id": preset.id,
        "name": str(getattr(preset, "name", "") or ""),
        "description": str(getattr(preset, "description", "") or ""),
        "trust": str(getattr(preset, "trust", "") or ""),
        "broken": bool(getattr(preset, "broken", False)),
        "toolset_summary": str(getattr(preset, "toolset_summary", lambda: "")()),
        "skills_summary": str(getattr(preset, "skills_summary", lambda: "")()),
    }


@method("preset.list")
def _(rid, params: dict) -> dict:
    try:
        from hermes_cli.agent_presets import discover_presets

        presets = [_preset_to_dict(p) for p in discover_presets()]
    except Exception as e:
        return _err(rid, 5000, f"preset discovery failed: {e}")
    default = ""
    try:
        default = str((_load_cfg().get("agent_presets", {}) or {}).get("default", "") or "")
    except Exception:
        pass
    return _ok(rid, {"presets": presets, "default": default})


@method("preset.apply")
def _(rid, params: dict) -> dict:
    preset_id = str(params.get("preset_id") or "").strip()
    session_id = str(params.get("session_id") or "").strip()
    if not preset_id:
        return _err(rid, 4006, "preset_id required")
    if not session_id:
        return _err(rid, 4006, "session_id required")

    # Validate the preset BEFORE touching anything — a typo'd id must not
    # half-apply (mirrors the CLI's load_preset ValueError path; also rejects
    # broken presets, which must never be mounted).
    try:
        from hermes_cli.agent_presets import load_preset

        load_preset(preset_id)
    except Exception as e:
        return _err(rid, 4006, f"unknown preset '{preset_id}': {e}")

    db = _get_db()
    if db is not None:
        try:
            # Harness blank-session rule (deepseek-harness agent-presets
            # `recompose`): a preset may only be swapped while the session is
            # still blank. Once the conversation has any message, the
            # composition is fixed — swapping tools mid-conversation would
            # leave logged tool calls (and prompt sections) the new
            # composition cannot reproduce. Live-but-idle sessions have
            # already flushed their last turn to the row, so the persisted
            # count is authoritative; a busy session is rejected below.
            row = db.get_session(session_id)
            if row and int(row.get("message_count") or 0) > 0:
                return _err(
                    rid,
                    4010,
                    "session already has messages — the preset is fixed once "
                    "the conversation starts (start a new chat to switch modes)",
                )
            db.set_session_agent_preset(session_id, preset_id)
        except Exception as e:
            return _err(rid, 5000, f"persist preset failed: {e}")

    # Recompose a live session: rebuild the agent with the new preset so the
    # next turn runs the new composition, keeping the conversation in place.
    with _sessions_lock:
        live = _find_live_session_by_key(session_id)
        if live is None:
            return _ok(rid, {"applied": True, "recomposed": False})
        sid, session = live
        if session.get("running"):
            return _err(
                rid,
                4009,
                "session busy — preset switch applies at the next turn start",
            )
        key = session.get("session_key") or session_id
        model_override = session.get("model_override")
        agent = session.get("agent")

    if agent is None:
        # Agent not built yet (deferred build): the next _start_agent_build
        # reads the persisted row via _stored_session_runtime_overrides, which
        # now carries the preset — nothing else to do.
        return _ok(rid, {"applied": True, "recomposed": False})

    try:
        new_agent = _make_agent(
            sid,
            key,
            session_id=key,
            platform_override=_session_source(session),
            model_override=model_override,
            agent_preset=preset_id,
        )
    except Exception as e:
        return _err(rid, 5000, f"preset recompose failed: {e}")

    with _sessions_lock:
        current = _sessions.get(sid)
        if current is None or current.get("agent") is not agent:
            return _err(rid, 4006, "session changed while switching preset")
        current["agent"] = new_agent
        # /new wipes session-scoped overrides; a preset recompose must NOT —
        # the user's in-session /model pick survives the switch (the session
        # dict is left untouched apart from the agent swap).
        # A rebuilt agent re-derives its own session row via _ensure_db_session
        # (which persists the preset id); surface the new composition.
        info = _session_info(new_agent, current)
    _emit("session.info", sid, info)
    _restart_slash_worker(sid, current)
    return _ok(rid, {"applied": True, "recomposed": True, "info": info})


def register(server) -> None:
    """Bind this module's handlers onto ``server``'s globals and registry."""
    _registry.install(server)