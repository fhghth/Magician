"""Meeting-room lifecycle engine: per-meeting state machine (M1 1.1).

Meeting lifetime is program lifetime (design resolution 2026-08-07, same shape
as a single conversation). The engine owns the room's status, persists every
transition through ``MeetingStore`` (which in turn appends to the append-only
``meeting_events`` stream), and provides the two lifecycle hooks that keep the
program-exit contract honest:

* ``shutdown_all_meetings()`` — program exit: non-terminal meetings persist
  ``aborted`` (with ``closed_at``), any unresolved/pending ledger items are
  flagged pending-replay so a later milestone can rebuild them.
* startup self-check (``mark_stale_meetings_interrupted``) — any meeting left
  in ``running``/``converging``/``suspended`` at boot with no live engine is
  marked ``interrupted`` (a terminal, human-revisable state; M4.3 replay is
  the recovery path).

Concurrency note: this is *not* the scheduler. The scheduler drives the
meeting's single coroutine; ``MeetingEngine`` only mutates status. All
transitions are validated against the static transition table — no code path
may bypass it (LLM/scheduler only ever *propose* a transition; this module is
the authority that applies and persists it).
"""

from __future__ import annotations

import time
from typing import Dict, Iterable, List, Optional

from agent.meeting.store import (
    MEETING_ABORTED,
    MEETING_CLOSED,
    MEETING_CONVERGING,
    MEETING_CREATED,
    MEETING_INTERRUPTED,
    MEETING_RUNNING,
    MEETING_SUSPENDED,
    MeetingStore,
)

# Named aliases re-exported for scheduler/seat/cli ergonomics.
STATE_CREATED = MEETING_CREATED
STATE_RUNNING = MEETING_RUNNING
STATE_CONVERGING = MEETING_CONVERGING
STATE_SUSPENDED = MEETING_SUSPENDED
STATE_CLOSED = MEETING_CLOSED
STATE_ABORTED = MEETING_ABORTED
STATE_INTERRUPTED = MEETING_INTERRUPTED

# Golden transition table. ``interrupted`` is terminal in M1: replay recovery
# (M4) is the only way out. ``closed``/``aborted`` are terminal by nature.
MEETING_TRANSITIONS: Dict[str, frozenset] = {
    MEETING_CREATED: frozenset(
        {MEETING_RUNNING, MEETING_ABORTED, MEETING_INTERRUPTED}
    ),
    MEETING_RUNNING: frozenset(
        {MEETING_CONVERGING, MEETING_SUSPENDED, MEETING_ABORTED, MEETING_INTERRUPTED}
    ),
    MEETING_CONVERGING: frozenset(
        {MEETING_CLOSED, MEETING_ABORTED, MEETING_INTERRUPTED}
    ),
    MEETING_SUSPENDED: frozenset(
        {MEETING_RUNNING, MEETING_ABORTED, MEETING_INTERRUPTED}
    ),
    MEETING_CLOSED: frozenset(),
    MEETING_ABORTED: frozenset(),
    MEETING_INTERRUPTED: frozenset(),
}

# Statuses that count as "the meeting is active and owes a terminal state".
# Used by program shutdown (force-abort) and by the startup orphan scan.
_ACTIVE_STATUSES = frozenset(
    {MEETING_RUNNING, MEETING_CONVERGING, MEETING_SUSPENDED}
)


def _now() -> float:
    return time.time()


class MeetingTransitionError(ValueError):
    """Raised when a transition is not allowed by the golden table."""


class MeetingEngine:
    """Applies + persists status transitions for one meeting.

    It deliberately holds no schedule/queue state — that belongs to the
    scheduler coroutine in M1.3. The engine's job is the lifecycle: it wraps a
    ``MeetingStore``, validates every transition, and persists it as both a
    row change and an event. ``close()`` releases the live-engine registration
    so the program-exit scan knows the meeting is no longer owned.
    """

    def __init__(self, store: MeetingStore, meeting_id: str):
        self._store = store
        self.meeting_id = meeting_id

    @property
    def store(self) -> MeetingStore:
        return self._store

    def status(self) -> str:
        """Current status from the store (source of truth is the row + events)."""
        row = self._store.get_meeting(self.meeting_id)
        if row is None:
            raise KeyError(f"meeting not found: {self.meeting_id}")
        return row["status"]

    def transition(self, to: str, actor: str = "system") -> bool:
        """Validate against the golden table, persist, and append to the stream.

        Returns True when a transition actually fired, False when the target
        equals the current status (idempotent no-op). Raises
        ``MeetingTransitionError`` for an illegal transition.
        """
        current = self.status()
        if to == current:
            return False
        if to not in MEETING_TRANSITIONS.get(current, frozenset()):
            raise MeetingTransitionError(
                f"illegal meeting transition: {current!r} -> {to!r} for {self.meeting_id}"
            )
        self._store.set_meeting_status(
            self.meeting_id,
            to,
            closed_at=_now() if to in (MEETING_CLOSED, MEETING_ABORTED, MEETING_INTERRUPTED) else None,
            actor=actor,
            from_status=current,
        )
        return True

    def start(self, actor: str = "system") -> bool:
        """created -> running."""
        return self.transition(MEETING_RUNNING, actor=actor)

    def converge(self, actor: str = "system") -> bool:
        """running -> converging (budget cut / user requested)."""
        return self.transition(MEETING_CONVERGING, actor=actor)

    def close(self, actor: str = "system") -> bool:
        """converging -> closed (products delivered)."""
        return self.transition(MEETING_CLOSED, actor=actor)

    def abort(self, actor: str = "system") -> bool:
        """Any active state -> aborted."""
        return self.transition(MEETING_ABORTED, actor=actor)

    def suspend(self, actor: str = "system") -> bool:
        """running -> suspended (pause)."""
        return self.transition(MEETING_SUSPENDED, actor=actor)

    def resume(self, actor: str = "system") -> bool:
        """suspended -> running."""
        return self.transition(MEETING_RUNNING, actor=actor)


# ── live-engine registry ────────────────────────────────────────────────────

_LIVE_ENGINES: Dict[str, MeetingEngine] = {}


def is_engine_live(meeting_id: str) -> bool:
    return meeting_id in _LIVE_ENGINES


def register_engine(engine: MeetingEngine) -> None:
    """Register a running engine; keyed by meeting id.

    The registry is used only by the startup orphan scan and the shutdown
    hook; it is *not* a lock or a mutex (single-coroutine-per-meeting is
    enforced by the scheduler, not here).
    """
    _LIVE_ENGINES[engine.meeting_id] = engine


def unregister_engine(meeting_id: str) -> None:
    _LIVE_ENGINES.pop(meeting_id, None)


def live_engine_ids() -> List[str]:
    return list(_LIVE_ENGINES.keys())


# ── lifecycle hooks ─────────────────────────────────────────────────────────

def mark_stale_meetings_interrupted(
    store: MeetingStore,
    *,
    active: Optional[Iterable[str]] = None,
) -> Dict[str, str]:
    """Startup self-check (WS6).

    Meetings found in an active status (running/converging/suspended) with no
    live engine are left over from a crashed/terminated process. Mark them
    ``interrupted`` — terminal, human-recoverable in the M4 replay milestone.
    Meetings tracked in ``_LIVE_ENGINES`` (or passed via ``active``) are
    untouched. Returns a map of meeting_id -> from-status that was interrupted.
    """
    excludes = set(_LIVE_ENGINES)
    if active:
        excludes.update(active)
    now = time.time()
    touched: Dict[str, str] = {}
    for row in store.list_meetings(limit=100000):
        from_status = row["status"]
        if from_status not in _ACTIVE_STATUSES:
            continue
        if row["id"] in excludes:
            continue
        store.set_meeting_status(
            row["id"],
            MEETING_INTERRUPTED,
            closed_at=now,
            actor="system.bootstrap",
            from_status=from_status,
        )
        touched[row["id"]] = from_status
    return touched


def shutdown_all_meetings(store: MeetingStore) -> Dict[str, str]:
    """Program-exit hook (WS6).

    Forces every meeting still in an active status to ``aborted`` (closed_at
    set) regardless of live ownership — the hook runs after engines have been
    asked to stop, and must never leave a dangling ``running`` row. Ledger
    entries that were never signed are recorded as pending-replay audit events
    (they legitimately survive the abort for the M4 replay milestone).
    Returns mapping meeting_id -> from_status.
    """
    now = time.time()
    touched: Dict[str, str] = {}
    for row in store.list_meetings(limit=200):
        from_status = row["status"]
        if from_status not in _ACTIVE_STATUSES:
            continue
        _flag_unsigned_ledger_for_replay(store, row["id"])
        store.set_meeting_status(
            row["id"],
            MEETING_ABORTED,
            closed_at=now,
            actor="system.shutdown",
            from_status=from_status,
        )
        touched[row["id"]] = from_status
    return touched


def _flag_unsigned_ledger_for_replay(store: MeetingStore, meeting_id: str) -> None:
    """Record pending (unsigned/proposed) ledger entries as replay-able audit events."""
    pending = [
        entry for entry in store.list_ledger(meeting_id)
        if entry.get("status") != "signed"
    ]
    if pending:
        store.emit(
            meeting_id,
            "ledger_pending_replay",
            actor="system-shutdown",
            payload={"pending": pending},
        )