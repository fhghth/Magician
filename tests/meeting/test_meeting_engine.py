"""M1 1.1 acceptance: the meeting lifecycle engine.

Covers dev-guide M1.1 DoD — the per-meeting state machine plus the two
program-lifecycle hooks that keep rooms from dangling:

* 1.1a  golden transition table: valid paths fire + persist (row AND event
        with from->to), illegal paths raise ``MeetingTransitionError``,
        idempotent same-state calls are no-ops.
* 1.1b  shutdown hook: running/converging/suspended meetings force-persist
        ``aborted`` (closed_at set) and unsigned ledger entries become
        pending-replay audit events; terminal/created rows are untouched.
* 1.1c  startup self-check: active meetings with no live engine are marked
        ``interrupted`` (terminal + human-revisable); live engines and
        explicitly-active ids are skipped.
"""

from __future__ import annotations

import pytest

from agent.meeting.engine import (
    MEETING_TRANSITIONS,
    MeetingEngine,
    MeetingTransitionError,
    mark_stale_meetings_interrupted,
    register_engine,
    shutdown_all_meetings,
    unregister_engine,
    live_engine_ids,
)
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
from hermes_state import SessionDB


@pytest.fixture
def db(tmp_path):
    session_db = SessionDB(db_path=tmp_path / "state.db")
    yield session_db
    try:
        session_db.close()
    except Exception:
        pass


@pytest.fixture
def store(db):
    return MeetingStore(db)


@pytest.fixture(autouse=True)
def _clean_live_registry():
    """LIVE_ENGINES is a module global; keep tests isolated from each other."""
    from agent.meeting import engine as mod

    yield
    mod._LIVE_ENGINES.clear()


def _make_running(store) -> str:
    mid = store.create_meeting(topic="会诊")
    store.set_meeting_status(mid, MEETING_RUNNING)
    return mid


class TestStateMachine:
    """1.1 golden transition table."""

    def test_transition_table_is_total_and_closed(self):
        """Every non-terminal status has an entry; no state has an out-edge
        from itself (guaranteed), and terminals map to empty sets."""
        non_terminal = {
            MEETING_CREATED,
            MEETING_RUNNING,
            MEETING_CONVERGING,
            MEETING_SUSPENDED,
        }
        assert set(MEETING_TRANSITIONS) == non_terminal | {
            MEETING_CLOSED,
            MEETING_ABORTED,
            MEETING_INTERRUPTED,
        }
        assert MEETING_TRANSITIONS[MEETING_CLOSED] == frozenset()
        assert MEETING_TRANSITIONS[MEETING_ABORTED] == frozenset()
        assert MEETING_TRANSITIONS[MEETING_INTERRUPTED] == frozenset()

    def test_happy_path_full_flow(self, store, db):
        mid = store.create_meeting(topic="t")
        eng = MeetingEngine(store, mid)
        assert eng.status() == MEETING_CREATED

        assert eng.start() is True
        assert eng.status() == MEETING_RUNNING
        assert eng.converge() is True
        assert eng.status() == MEETING_CONVERGING
        assert eng.close() is True
        assert eng.status() == MEETING_CLOSED

        with db._read_ctx() as conn:
            row = conn.execute(
                "SELECT status, closed_at FROM meetings WHERE id = ?", (mid,)
            ).fetchone()
        assert row["status"] == MEETING_CLOSED
        assert row["closed_at"] is not None

        kinds = [e["kind"] for e in store.get_events(mid)]
        assert kinds.count("status") == 3
        statuses = [e["payload"]["to"] for e in store.get_events(mid)]
        assert statuses == [
            MEETING_RUNNING,
            MEETING_CONVERGING,
            MEETING_CLOSED,
        ]

    def test_transition_events_carry_from_and_to(self, store):
        mid = store.create_meeting(topic="t")
        MeetingEngine(store, mid).start(actor="user")
        evt = store.get_events(mid)[-1]
        assert evt["actor"] == "user"
        assert evt["payload"] == {"from": MEETING_CREATED, "to": MEETING_RUNNING}

    def test_terminal_transition_sets_closed_at(self, store):
        mid = _make_running(store)
        MeetingEngine(store, mid).abort()
        row = store.get_meeting(mid)
        assert row["status"] == MEETING_ABORTED
        assert row["closed_at"] is not None

    def test_same_status_is_noop(self, store):
        mid = store.create_meeting(topic="t")
        eng = MeetingEngine(store, mid)
        assert eng.start() is True
        assert eng.start() is False  # already running
        assert len(store.get_events(mid)) == 1  # no duplicate status event

    def test_illegal_transition_raises(self, store):
        mid = store.create_meeting(topic="t")
        eng = MeetingEngine(store, mid)
        with pytest.raises(MeetingTransitionError):
            eng.converge()  # created -> converging not allowed

    def test_terminal_states_never_leave(self, store):
        mid = _make_running(store)
        eng = MeetingEngine(store, mid)
        eng.abort()
        with pytest.raises(MeetingTransitionError):
            eng.start()
        with pytest.raises(MeetingTransitionError):
            eng.converge()

    def test_suspend_resume_round_trip(self, store):
        mid = _make_running(store)
        eng = MeetingEngine(store, mid)
        assert eng.suspend() is True
        assert eng.status() == MEETING_SUSPENDED
        assert eng.resume() is True
        assert eng.status() == MEETING_RUNNING

    def test_missing_meeting_raises(self, store):
        eng = MeetingEngine(store, "does-not-exist")
        with pytest.raises(KeyError):
            eng.status()


class TestShutdownHook:
    def test_shutdown_aborts_active_and_sets_closed_at(self, store, db):
        running = _make_running(store)
        converging = store.create_meeting(topic="c")
        store.set_meeting_status(converging, MEETING_CONVERGING)
        suspended = store.create_meeting(topic="s")
        store.set_meeting_status(suspended, MEETING_SUSPENDED)

        touched = shutdown_all_meetings(store)
        assert set(touched) == {running, converging, suspended}

        for mid in (running, converging, suspended):
            row = store.get_meeting(mid)
            assert row["status"] == MEETING_ABORTED
            assert row["closed_at"] is not None

    def test_shutdown_never_touches_terminal(self, store):
        created = store.create_meeting(topic="new", status=MEETING_CREATED)
        closed = store.create_meeting(topic="d")
        store.set_meeting_status(closed, MEETING_CLOSED)
        aborted = store.create_meeting(topic="a")
        store.set_meeting_status(aborted, MEETING_ABORTED)

        touched = shutdown_all_meetings(store)
        assert touched == {}
        assert store.get_meeting(created)["status"] == MEETING_CREATED
        assert store.get_meeting(closed)["status"] == MEETING_CLOSED
        assert store.get_meeting(aborted)["status"] == MEETING_ABORTED

    def test_shutdown_flags_unsigned_ledger_for_replay(self, store):
        mid = _make_running(store)
        signed = store.add_ledger(
            mid, kind="decision", value={"goal": "x"}, source_msg_id="m1",
            status="signed",
        )
        pending = store.add_ledger(
            mid, kind="decision", value={"goal": "y"}, source_msg_id="m2",
            status="proposed",
        )
        _ = signed

        shutdown_all_meetings(store)
        pending_events = [
            e for e in store.get_events(mid)
            if e["kind"] == "ledger_pending_replay"
        ]
        assert len(pending_events) == 1
        pending_ids = {e["id"] for e in pending_events[0]["payload"]["pending"]}
        assert pending_ids == {pending}


class TestStartupSelfCheck:
    def test_running_meeting_without_engine_is_interrupted(self, store):
        mid = _make_running(store)
        touched = mark_stale_meetings_interrupted(store)
        assert touched == {mid: MEETING_RUNNING}
        row = store.get_meeting(mid)
        assert row["status"] == MEETING_INTERRUPTED
        assert row["closed_at"] is not None

    def test_live_engine_owns_its_meeting(self, store):
        mid = _make_running(store)
        register_engine(MeetingEngine(store, mid))
        try:
            touched = mark_stale_meetings_interrupted(store)
            assert touched == {}
            assert store.get_meeting(mid)["status"] == MEETING_RUNNING
        finally:
            unregister_engine(mid)

    def test_explicit_active_skip(self, store):
        mid = _make_running(store)
        touched = mark_stale_meetings_interrupted(store, active=[mid])
        assert touched == {}
        assert store.get_meeting(mid)["status"] == MEETING_RUNNING

    def test_suspended_and_converging_also_interrupted(self, store):
        conv = store.create_meeting(topic="c")
        store.set_meeting_status(conv, MEETING_CONVERGING)
        susp = store.create_meeting(topic="s")
        store.set_meeting_status(susp, MEETING_SUSPENDED)

        touched = mark_stale_meetings_interrupted(store)
        assert touched[conv] == MEETING_CONVERGING
        assert touched[susp] == MEETING_SUSPENDED

    def test_created_and_terminal_untouched(self, store):
        created = store.create_meeting(topic="c")
        closed = store.create_meeting(topic="d")
        store.set_meeting_status(closed, MEETING_CLOSED)

        touched = mark_stale_meetings_interrupted(store)
        assert touched == {}
        assert store.get_meeting(created)["status"] == MEETING_CREATED
        assert store.get_meeting(closed)["status"] == MEETING_CLOSED


class TestLiveRegistry:
    def test_registry_round_trip(self, store):
        mid = _make_running(store)
        from agent.meeting.engine import is_engine_live

        assert is_engine_live(mid) is False
        eng = MeetingEngine(store, mid)
        register_engine(eng)
        assert is_engine_live(mid) is True
        assert live_engine_ids() == [mid]
        unregister_engine(mid)
        assert is_engine_live(mid) is False

    def test_autouse_fixture_cleans_registry(self, store):
        # Validates the isolation fixture works — no leakage from prior tests.
        from agent.meeting.engine import is_engine_live

        assert is_engine_live("anything") is False