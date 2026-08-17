"""M1 1.3 acceptance: the rules-only scheduler.

Covers dev-guide M1.3 DoD:
* 1.3a  pure round-robin: seats speak in fixed alternating order.
* 1.3b  triple-budget deduction — every turn persists rounds=1 + the seat's
        per-turn tokens through store.add_spend (NOT tools/budget_config.py),
        wall-clock seconds derived from meeting creation.
* 1.3c  ANY budget exhaustion force-converges the meeting (each of the three
        dimensions tested) and emits meeting.converging.
* 1.3d  turns land on the meeting's append-only stream (kind="turn", actor=
        seat) so replay/UI rebuild from events alone.
"""

from __future__ import annotations

import pytest

from agent.meeting.engine import MeetingEngine
from agent.meeting.scheduler import (
    EVENT_BUDGET_UPDATE,
    EVENT_CONVERGING,
    EVENT_TURN_COMPLETE,
    BudgetState,
    MeetingScheduler,
)
from agent.meeting.seat import Seat
from agent.meeting.store import MEETING_CONVERGING, MeetingStore
from hermes_state import SessionDB


class StubSeatAgent:
    """AIAgent-shaped fake: fixed token count per turn, records calls."""

    def __init__(self, name, reply="ok", tokens=3):
        self.name = name
        self.reply = reply
        self.tokens = tokens
        self._last_turn_usage = {"total_tokens": tokens}
        self.calls = 0
        self.prompts: list = []

    def run_conversation(self, **kwargs):
        self.calls += 1
        self.prompts.append(kwargs["user_message"])
        return {
            "final_response": f"{self.reply}[{self.name}#{self.calls}]",
            "messages": [],
            "api_calls": 1,
            "completed": True,
            "failed": False,
        }


class Collector:
    def __init__(self):
        self.events: list = []

    def __call__(self, event_type: str, payload: dict):
        self.events.append((event_type, payload))


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


def _make_scheduler(
    store,
    *,
    n_seats=2,
    budget_rounds=None,
    budget_seconds=None,
    budget_tokens=None,
    emit=None,
):
    mid = store.create_meeting(
        topic="t",
        mode="light",
        budget_rounds=budget_rounds,
        budget_seconds=budget_seconds,
        budget_tokens=budget_tokens,
    )
    engine = MeetingEngine(store, mid)
    agents = [StubSeatAgent(f"A{i}", tokens=3 + i) for i in range(n_seats)]
    seats = [
        Seat(meeting_id=mid, seat_id=f"s{i}", agent=a) for i, a in enumerate(agents)
    ]
    sched = MeetingScheduler(engine, seats, stream_emit=emit)
    return sched, agents, mid


class TestBudgetState:
    def test_rounds_exhaustion(self):
        b = BudgetState(
            rounds=10, tokens=100, seconds=10,
            budget_rounds=10, budget_tokens=500,
        )
        assert b.exhausted() == "rounds"

    def test_seconds_exhaustion(self):
        b = BudgetState(
            rounds=0, tokens=100, seconds=30,
            budget_seconds=30, budget_tokens=500,
        )
        assert b.exhausted() == "seconds"

    def test_tokens_exhaustion(self):
        b = BudgetState(
            rounds=0, tokens=100, seconds=1,
            budget_tokens=100, budget_seconds=30,
        )
        assert b.exhausted() == "tokens"

    def test_no_budget_never_exhausts(self):
        b = BudgetState(rounds=999, tokens=999, seconds=999)
        assert b.exhausted() is None

    def test_remaining_projection(self):
        b = BudgetState(
            rounds=2, tokens=40, seconds=5,
            budget_rounds=10, budget_tokens=100,
        )
        rem = b.remaining()
        assert rem["rounds"] == 8
        assert rem["tokens"] == 60
        assert rem["seconds"] is None


class TestRoundRobin:
    def test_alternating_order(self, store):
        sched, agents, mid = _make_scheduler(store, budget_rounds=4)
        sched.run()
        assert agents[0].calls == 2
        assert agents[1].calls == 2
        turns = [
            e["actor"]
            for e in store.get_events(mid)
            if e["kind"] == "turn"
        ]
        assert turns == ["s0", "s1", "s0", "s1"]

    def test_turns_persist_with_token_payload(self, store):
        sched, agents, mid = _make_scheduler(store, budget_rounds=2)
        sched.run()
        turns = [e for e in store.get_events(mid) if e["kind"] == "turn"]
        assert len(turns) == 2
        assert turns[0]["actor"] == "s0"
        assert turns[0]["payload"]["tokens"] == 3
        assert turns[1]["actor"] == "s1"
        assert turns[1]["payload"]["tokens"] == 4

    def test_prompt_incorporates_previous_speaker(self, store):
        sched, agents, mid = _make_scheduler(store, n_seats=2, budget_rounds=3)
        sched.run()
        second = agents[1].prompts[0]
        assert "上一位发言" in second
        assert "s0" in second


class TestBudgetDeduction:
    def test_rounds_and_tokens_accumulate(self, store):
        sched, agents, mid = _make_scheduler(store, budget_rounds=3)
        sched.run()
        row = store.get_meeting(mid)
        assert row["spent_rounds"] == 3
        assert row["spent_tokens"] == 3 + 4 + 3

    def test_token_budget_cuts_early(self, store):
        # s0 consumes 3 tokens/turn; budget_tokens=3 → exactly one turn.
        sched, agents, mid = _make_scheduler(store, budget_tokens=3)
        sched.run()
        row = store.get_meeting(mid)
        assert row["spent_rounds"] == 1
        assert row["spent_tokens"] == 3

    def test_seconds_budget_respected(self, store, db):
        sched, agents, mid = _make_scheduler(
            store, budget_seconds=1, budget_rounds=50
        )
        # Age the meeting so wall-clock seconds already exceed the budget —
        # deterministic, no sleeps.
        def _age(conn):
            conn.execute(
                "UPDATE meetings SET created_at = created_at - 5 WHERE id = ?",
                (mid,),
            )

        db._execute_write(_age)
        sched.run()
        row = store.get_meeting(mid)
        assert row["spent_rounds"] == 0
        assert row["status"] == MEETING_CONVERGING


class TestForcedConvergence:
    def test_round_exhaustion_converges(self, store):
        sched, agents, mid = _make_scheduler(store, budget_rounds=2)
        coll = Collector()
        sched._emit = coll
        sched.run()
        assert store.get_meeting(mid)["status"] == MEETING_CONVERGING
        assert any(t == EVENT_CONVERGING for t, _ in coll.events)

    def test_token_exhaustion_converges(self, store):
        sched, agents, mid = _make_scheduler(store, budget_tokens=3)
        sched.run()
        assert store.get_meeting(mid)["status"] == MEETING_CONVERGING

    def test_default_round_ceiling_converges(self, store):
        sched, agents, mid = _make_scheduler(store)
        result = sched.run()
        assert result["turns"] == 20  # MAX_BUDGET_DEFAULT_ROUNDS
        assert store.get_meeting(mid)["status"] == MEETING_CONVERGING

    def test_reports_which_budget_died(self, store):
        sched, agents, mid = _make_scheduler(store, budget_rounds=1)
        result = sched.run()
        assert result["exhausted"] == "rounds"
        assert result["turns"] == 1


class TestEventStream:
    def test_turn_and_budget_events(self, store):
        coll = Collector()
        sched, agents, mid = _make_scheduler(store, budget_rounds=2, emit=coll)
        sched.run()
        kinds = [t for t, _ in coll.events]
        assert kinds.count(EVENT_TURN_COMPLETE) == 2
        assert EVENT_BUDGET_UPDATE in kinds
        assert EVENT_CONVERGING in kinds

    def test_no_seats_rejected(self, store):
        mid = store.create_meeting(topic="t")
        engine = MeetingEngine(store, mid)
        with pytest.raises(ValueError):
            MeetingScheduler(engine, [])