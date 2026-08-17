"""Meeting-room DAO layer.

Write path reuses the existing state DB connection management
(``SessionDB._execute_write`` — BEGIN IMMEDIATE + jitter retry + lock). We
never open a new sqlite connection: the repo has a lock/leak history
(sqlite_leak_fix.png, tests/test_sqlite_lock_safe_inspection.py).

Design contract (docs/design/meeting-room-dev-guide.md):
* ``meeting_events`` is the single source of truth. Every state change is
  first written as an event, then any derived projection is updated.
* ``seq`` is guaranteed monotonically increasing per meeting by the DAO (it
  is computed inside the same ``_execute_write`` transaction as the insert),
  so replay is total-ordered even under concurrent appends.
* ``emit()`` is the only write entry point for ``meeting_events``.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Sequence

# SessionDB is duck-typed: any object exposing _execute_write/_read_ctx will
# do. We keep the import out of the hot path (line 41 of the schema mixin
# history) so meeting code can load without dragging in the whole session DB.
from hermes_state import SessionDB  # noqa: E402

# Meeting lifecycle states (dev-guide M1 1.1 / implementation doc §2).
MEETING_CREATED = "created"
MEETING_RUNNING = "running"
MEETING_CONVERGING = "converging"
MEETING_SUSPENDED = "suspended"
MEETING_CLOSED = "closed"
MEETING_ABORTED = "aborted"
MEETING_INTERRUPTED = "interrupted"

_VALID_STATUSES = frozenset(
    {
        MEETING_CREATED,
        MEETING_RUNNING,
        MEETING_CONVERGING,
        MEETING_SUSPENDED,
        MEETING_CLOSED,
        MEETING_ABORTED,
        MEETING_INTERRUPTED,
    }
)


def _now() -> float:
    return time.time()


class MeetingStore:
    """Read/write DAO for the five meeting-room tables.

    One instance wraps a live ``SessionDB`` sharing its connection, lock, and
    WAL conventions. It is single-instance-per-SessionDB in practice (the
    engine holds one); methods are nevertheless safe to call from any thread
    because every write funnels through ``_execute_write``.
    """

    def __init__(self, db: SessionDB):
        self._db = db

    # ── meetings ──────────────────────────────────────────────────────────

    def create_meeting(
        self,
        *,
        meeting_id: Optional[str] = None,
        origin_ref: Optional[str] = None,
        topic: str,
        mode: str = "light",
        status: str = MEETING_CREATED,
        budget_rounds: Optional[int] = None,
        budget_seconds: Optional[int] = None,
        budget_tokens: Optional[int] = None,
        delegation_profile_id: Optional[str] = None,
        project_id: Optional[str] = None,
        worktree_path: Optional[str] = None,
    ) -> str:
        """Create a meeting row. Returns the meeting id."""
        mid = meeting_id or uuid.uuid4().hex
        if status not in _VALID_STATUSES:
            raise ValueError(f"invalid meeting status: {status!r}")
        now = _now()

        def _do(conn):
            conn.execute(
                "INSERT INTO meetings "
                "(id, origin_ref, topic, mode, status, budget_rounds, "
                " budget_seconds, budget_tokens, spent_rounds, spent_tokens, "
                " delegation_profile_id, project_id, worktree_path, "
                " created_at, closed_at) "
                "VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?,?,NULL)",
                (
                    mid,
                    origin_ref,
                    topic,
                    mode,
                    status,
                    budget_rounds,
                    budget_seconds,
                    budget_tokens,
                    delegation_profile_id,
                    project_id,
                    worktree_path,
                    now,
                ),
            )

        self._db._execute_write(_do)
        return mid

    def get_meeting(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        with self._db._read_ctx() as conn:
            rows = conn.execute(
                "SELECT * FROM meetings WHERE id = ?", (meeting_id,)
            ).fetchall()
        if not rows:
            return None
        return dict(rows[0])

    def list_meetings(
        self, status: Optional[str] = None, limit: int = 200
    ) -> List[Dict[str, Any]]:
        if status is not None and status not in _VALID_STATUSES:
            raise ValueError(f"invalid meeting status: {status!r}")
        sql = "SELECT * FROM meetings"
        params: List[Any] = []
        if status is not None:
            sql += " WHERE status = ?"
            params.append(status)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(int(limit))
        with self._db._read_ctx() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def set_meeting_status(
        self,
        meeting_id: str,
        status: str,
        *,
        closed_at: Optional[float] = None,
        emit_event: bool = True,
        actor: str = "system",
        from_status: Optional[str] = None,
    ) -> None:
        """Transition a meeting's status and, by default, record it as an event.

        ``from_status`` (when known) is persisted in the event payload so
        replay/audit can reconstruct the exact transition that fired.
        """
        if status not in _VALID_STATUSES:
            raise ValueError(f"invalid meeting status: {status!r}")

        def _do(conn):
            if closed_at is None:
                conn.execute(
                    "UPDATE meetings SET status = ? WHERE id = ?",
                    (status, meeting_id),
                )
            else:
                conn.execute(
                    "UPDATE meetings SET status = ?, closed_at = ? WHERE id = ?",
                    (status, closed_at, meeting_id),
                )

        self._db._execute_write(_do)
        if emit_event:
            payload: Dict[str, Any] = {"to": status}
            if from_status is not None:
                payload["from"] = from_status
            self.emit(meeting_id, "status", actor=actor, payload=payload)

    def add_spend(
        self,
        meeting_id: str,
        *,
        rounds: int = 0,
        tokens: int = 0,
    ) -> None:
        """Accumulate budget spend (rounds / tokens) on the meeting row."""
        if rounds < 0 or tokens < 0:
            raise ValueError("spend increments must be non-negative")

        def _do(conn):
            conn.execute(
                "UPDATE meetings SET "
                " spent_rounds = spent_rounds + ?, "
                " spent_tokens = spent_tokens + ? "
                "WHERE id = ?",
                (rounds, tokens, meeting_id),
            )

        self._db._execute_write(_do)

    # ── meeting_events (Tier 0) ───────────────────────────────────────────

    def emit(
        self,
        meeting_id: str,
        kind: str,
        *,
        actor: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        intent: Optional[str] = None,
        pre_state_ref: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Append an event to the meeting's event stream.

        The unique write entry point for ``meeting_events``. ``seq`` is
        computed inside the same ``_execute_write`` transaction as the
        insert, so concurrent appends from any thread serialize on the
        writer lock and always yield contiguous, meeting-local, strictly
        increasing sequence numbers (replay/UI/audit all rely on this).

        Returns the row written as a dict.
        """
        now = _now()
        event_id = uuid.uuid4().hex

        def _do(conn):
            row = conn.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM meeting_events "
                "WHERE meeting_id = ?",
                (meeting_id,),
            ).fetchone()
            seq = int(row[0])
            conn.execute(
                "INSERT INTO meeting_events "
                "(id, meeting_id, seq, kind, actor, payload_json, "
                " intent, pre_state_ref, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    event_id,
                    meeting_id,
                    seq,
                    kind,
                    actor,
                    json.dumps(payload or {}, ensure_ascii=False),
                    intent,
                    pre_state_ref,
                    now,
                ),
            )
            return seq

        try:
            seq = self._db._execute_write(_do)
        except Exception:
            raise
        return {
            "id": event_id,
            "meeting_id": meeting_id,
            "seq": seq,
            "kind": kind,
            "actor": actor,
            "payload": payload or {},
            "intent": intent,
            "pre_state_ref": pre_state_ref,
            "created_at": now,
        }

    def get_events(
        self, meeting_id: str, *, after_seq: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """All events for a meeting, ordered by seq (replay order)."""
        sql = (
            "SELECT id, meeting_id, seq, kind, actor, payload_json, "
            " intent, pre_state_ref, created_at "
            "FROM meeting_events WHERE meeting_id = ?"
        )
        params: List[Any] = [meeting_id]
        if after_seq is not None:
            sql += " AND seq > ?"
            params.append(after_seq)
        sql += " ORDER BY seq ASC"
        with self._db._read_ctx() as conn:
            rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            row = dict(r)
            row["payload"] = json.loads(row.pop("payload_json") or "{}")
            out.append(row)
        return out

    def get_max_seq(self, meeting_id: str) -> int:
        with self._db._read_ctx() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM meeting_events "
                "WHERE meeting_id = ?",
                (meeting_id,),
            ).fetchone()
        return int(row[0])

    # ── meeting_keyframes ──────────────────────────────────────────────────

    def add_keyframe(
        self,
        meeting_id: str,
        *,
        source_msg_id: str,
        text: str,
        clearance: str = "public",
        source: str = "user",
        status: str = "candidate",
    ) -> str:
        kid = uuid.uuid4().hex

        def _do(conn):
            conn.execute(
                "INSERT INTO meeting_keyframes "
                "(id, meeting_id, source_msg_id, text, clearance, source, status) "
                "VALUES (?,?,?,?,?,?,?)",
                (kid, meeting_id, source_msg_id, text, clearance, source, status),
            )

        self._db._execute_write(_do)
        return kid

    def list_keyframes(
        self, meeting_id: str, *, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        params: List[Any] = [meeting_id]
        sql = "SELECT * FROM meeting_keyframes WHERE meeting_id = ?"
        if status is not None:
            sql += " AND status = ?"
            params.append(status)
        sql += " ORDER BY rowid ASC"
        with self._db._read_ctx() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def set_keyframe_status(
        self, keyframe_id: str, status: str
    ) -> None:
        def _do(conn):
            conn.execute(
                "UPDATE meeting_keyframes SET status = ? WHERE id = ?",
                (status, keyframe_id),
            )

        self._db._execute_write(_do)

    # ── meeting_ledger ─────────────────────────────────────────────────────

    def add_ledger(
        self,
        meeting_id: str,
        *,
        kind: str,
        value: Dict[str, Any],
        source_msg_id: str,
        status: str = "proposed",
        supersedes_id: Optional[str] = None,
        signed_by: Optional[str] = None,
    ) -> str:
        lid = uuid.uuid4().hex

        def _do(conn):
            conn.execute(
                "INSERT INTO meeting_ledger "
                "(id, meeting_id, kind, value_json, supersedes_id, "
                " source_msg_id, status, signed_by, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    lid,
                    meeting_id,
                    kind,
                    json.dumps(value, ensure_ascii=False),
                    supersedes_id,
                    source_msg_id,
                    status,
                    signed_by,
                    _now(),
                ),
            )

        self._db._execute_write(_do)
        return lid

    def list_ledger(
        self,
        meeting_id: str,
        *,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        params: List[Any] = [meeting_id]
        sql = "SELECT * FROM meeting_ledger WHERE meeting_id = ?"
        if status is not None:
            sql += " AND status = ?"
            params.append(status)
        sql += " ORDER BY created_at ASC, rowid ASC"
        with self._db._read_ctx() as conn:
            rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            row = dict(r)
            row["value"] = json.loads(row.pop("value_json") or "{}")
            out.append(row)
        return out

    def ledger_value(self, meeting_id: str, kind: str) -> Optional[Dict[str, Any]]:
        """Latest non-superseded, non-vetoed value of a ledger kind."""
        with self._db._read_ctx() as conn:
            row = conn.execute(
                "SELECT value_json FROM meeting_ledger "
                "WHERE meeting_id = ? AND kind = ? "
                "  AND status != 'vetoed' "
                "ORDER BY created_at DESC, rowid DESC LIMIT 1",
                (meeting_id, kind),
            ).fetchone()
        if not row:
            return None
        return json.loads(row[0] or "{}")

    # ── meeting_claims ─────────────────────────────────────────────────────

    def add_claim(
        self,
        *,
        msg_id: str,
        claim_text: str,
        claim_class: str,
        citation: Optional[str] = None,
        verify_status: Optional[str] = None,
        declared_by: str = "speaker",
    ) -> str:
        cid = uuid.uuid4().hex

        def _do(conn):
            conn.execute(
                "INSERT INTO meeting_claims "
                "(id, msg_id, claim_text, class, citation, verify_status, declared_by) "
                "VALUES (?,?,?,?,?,?,?)",
                (cid, msg_id, claim_text, claim_class, citation, verify_status, declared_by),
            )

        self._db._execute_write(_do)
        return cid

    def list_claims(self, *, msg_id: Optional[str] = None) -> List[Dict[str, Any]]:
        params: List[Any] = []
        sql = "SELECT * FROM meeting_claims"
        if msg_id is not None:
            sql += " WHERE msg_id = ?"
            params.append(msg_id)
        sql += " ORDER BY rowid ASC"
        with self._db._read_ctx() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]