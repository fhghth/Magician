"""M1 1.2 acceptance: seats and the turn runner.

Covers dev-guide M1.2 DoD:
* 1.2a  a seat is an independent AIAgent (own history) — the seat lazy-builds
        its agent via the factory and reuses it across turns.
* 1.2b  TurnRunner drives one turn: prompt + system message + history are
        forwarded; the streamed reply is mirrored over the message.* pipeline
        (start → delta* → complete) so the desktop needs no new renderer.
* 1.2c  turn accounting: token usage is read from the agent's per-turn usage,
        and turn seq increments per turn; exception paths return a failed
        TurnResult that still closes the stream.
"""

from __future__ import annotations

import pytest

from agent.meeting.seat import (
    EVENT_MESSAGE_COMPLETE,
    EVENT_MESSAGE_DELTA,
    EVENT_MESSAGE_START,
    Seat,
    TurnResult,
    TurnRunner,
)


class StubAgent:
    """AIAgent-shaped fake: records calls, streams deltas optionally."""

    def __init__(self, *, reply="hello", stream=False, usage=None, fail=False):
        self.reply = reply
        self.stream = stream
        self.usage = usage or {"total_tokens": 42}
        self.fail = fail
        self._last_turn_usage = self.usage
        self.calls = []

    def run_conversation(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError("boom")
        if self.stream:
            for tok in self.reply.split(" "):
                kwargs["stream_callback"](tok + " ")
        return {
            "final_response": self.reply,
            "messages": [
                {"role": "user", "content": kwargs["user_message"]},
                {"role": "assistant", "content": self.reply},
            ],
            "api_calls": 1,
            "completed": True,
            "failed": False,
        }


class Collector:
    """Records stream_emit calls as (event_type, payload) tuples."""

    def __init__(self):
        self.events: list = []

    def __call__(self, event_type: str, payload: dict):
        self.events.append((event_type, payload))


def _make_seat(agent=None, factory=None):
    return Seat(
        meeting_id="m1",
        seat_id="red",
        role="redteam",
        name="红队",
        objective="挑刺",
        agent=agent,
        agent_factory=factory,
    )


class TestSeat:
    def test_seat_owns_its_agent(self):
        agent = StubAgent()
        seat = _make_seat(agent=agent)
        assert seat.ensure_agent() is agent
        assert seat.topic == "seat:red"

    def test_seat_factory_lazy_build(self):
        built = []

        def factory():
            a = StubAgent()
            built.append(a)
            return a

        seat = Seat(
            meeting_id="m", seat_id="p", role="proposer",
            agent_factory=factory,
        )
        assert built == []
        seat.ensure_agent()
        seat.ensure_agent()
        assert len(built) == 1  # built once and reused

    def test_seat_without_agent_source_raises(self):
        seat = Seat(meeting_id="m", seat_id="x")
        with pytest.raises(RuntimeError):
            seat.ensure_agent()


class TestTurnRunner:
    def test_prompt_forwarded_and_agent_reused(self):
        agent = StubAgent(reply="我认为这可行")
        seat = Seat(meeting_id="m", seat_id="p", agent=agent)
        runner = TurnRunner(seat)
        out = runner.run("讨论一下", system_message="你是评审员", conversation_history=[{"role": "user", "content": "h"}])
        assert isinstance(out, TurnResult)
        assert out.text == "我认为这可行"
        assert out.completed is True
        assert out.turn_seq == 1
        call = agent.calls[0]
        assert call["user_message"] == "讨论一下"
        assert call["conversation_history"] == [{"role": "user", "content": "h"}]

    def test_stream_mirrors_to_message_pipeline(self):
        agent = StubAgent(reply="one two", stream=True)
        seat = Seat(meeting_id="m", seat_id="red", agent=agent)
        coll = Collector()
        runner = TurnRunner(seat, stream_emit=coll)
        runner.run("t")
        kinds = [t for t, _ in coll.events]
        assert kinds[0] == EVENT_MESSAGE_START
        assert kinds[-1] == EVENT_MESSAGE_COMPLETE
        assert EVENT_MESSAGE_DELTA in kinds
        texts = "".join(p["text"] for t, p in coll.events if t == EVENT_MESSAGE_DELTA)
        assert texts == "one two "

    def test_non_streaming_emits_final_once(self):
        agent = StubAgent(reply="full text", stream=False)
        collector = Collector()
        runner = TurnRunner(Seat(agent=agent, meeting_id="m", seat_id="s"), stream_emit=collector)
        runner.run("t")
        deltas = [p["text"] for t, p in collector.events if t == EVENT_MESSAGE_DELTA]
        assert deltas == ["full text"]

    def test__turn_tokens_from_usage(self):
        agent = StubAgent(usage={"total_tokens": 123})
        seat = Seat(agent=agent, meeting_id="m", seat_id="s")
        out = TurnRunner(seat).run("x")
        assert out.tokens == 123

    def test_failed_turn_keeps_stream_terminal(self):
        agent = StubAgent(fail=True)
        coll = Collector()
        runner = TurnRunner(Seat(agent=agent, meeting_id="m", seat_id="s"), stream_emit=coll)
        out = runner.run("t")
        assert out.failed is True
        assert "boom" in out.error
        assert out.completed is False
        assert coll.events[-1][0] == EVENT_MESSAGE_COMPLETE
        assert coll.events[-1][1]["status"] == "error"

    def test_turn_seq_increments(self):
        agent = StubAgent(reply="a")
        seat = Seat(agent=agent, meeting_id="m", seat_id="s")
        runner = TurnRunner(seat)
        assert runner.run("1").turn_seq == 1
        assert runner.run("2").turn_seq == 2
        assert seat.turn_count == 2

    def test_interrupt_passthrough(self):
        class Interruptible(StubAgent):
            def interrupt(self, hard_cancel=False):
                self._interrupted = hard_cancel

        agent = Interruptible()
        runner = TurnRunner(Seat(agent=agent, meeting_id="m", seat_id="s"))
        runner.interrupt(hard_cancel=True)
        assert agent._interrupted is True