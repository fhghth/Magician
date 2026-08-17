"""Meeting-room seat: one independent AIAgent + its turn driver (M1 1.2).

Each seat is an isolated ``AIAgent`` instance (run_agent.py) holding its own
conversation history — the seat's side of the discussion lives inside the
agent, so seats do not share raw transcripts through the model API. ``Seat``
wraps the agent and its meeting identity (seat id / name / role / objective).

``TurnRunner`` drives a single seat turn: it hands the meeting's current
prompt to the seat agent, mirrors the streamed reply over the existing
``message.*`` event pipeline (immediately visible in the desktop message
stream — no second rendering channel), and returns a flat ``TurnResult`` with
token usage for the scheduler's budget ledger.

Concurrency: a seat may only ever run one turn at a time (the scheduler owns
the floor). ``TurnRunner.run`` is re-entrant-safe for the tests but the
scheduler is the sole caller in production.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

# The message.* event family a TurnRunner emits. Payload convention:
#   message.start(seat_id) → message.delta{text}* → message.complete{text}
EVENT_MESSAGE_START = "message.start"
EVENT_MESSAGE_DELTA = "message.delta"
EVENT_MESSAGE_COMPLETE = "message.complete"


def _noop_stream_emit(event_type: str, payload: Dict[str, Any]) -> None:
    """Default stream sink: drop everything (headless / cron usage)."""


@dataclass
class Seat:
    """A single participant in a meeting — one AIAgent, its own history.

    ``agent``/``agent_factory`` are mutually exclusive: either an already-built
    ``AIAgent``-shaped object (tests / gateway reuse) or a zero-arg factory
    invoked lazily on first turn. The seat's own objective/persona is stored
    here; the meeting transcript is injected per-turn by the scheduler.
    """

    meeting_id: str
    seat_id: str
    role: str = "member"
    name: str = ""
    objective: str = ""
    agent_factory: Optional[Callable[[], Any]] = None
    agent: Optional[Any] = None
    turn_count: int = 0

    def ensure_agent(self) -> Any:
        """Materialize the wrapped AIAgent on first use."""
        if self.agent is None:
            if self.agent_factory is None:
                raise RuntimeError(
                    f"seat {self.seat_id} has neither agent nor agent_factory"
                )
            self.agent = self.agent_factory()
        return self.agent

    @property
    def topic(self) -> str:
        """Event bus topic for this seat's stream (message.* events)."""
        return f"seat:{self.seat_id}"


@dataclass
class TurnResult:
    """Result of a single seat turn, flat and JSON-safe for the event bus."""

    text: str = ""
    tokens: int = 0
    api_calls: int = 0
    completed: bool = False
    failed: bool = False
    interrupted: bool = False
    error: str = ""
    turn_seq: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "tokens": self.tokens,
            "api_calls": self.api_calls,
            "completed": self.completed,
            "failed": self.failed,
            "interrupted": self.interrupted,
            "error": self.error,
            "turn_seq": self.turn_seq,
        }


def _turn_tokens(agent: Any, result: Dict[str, Any]) -> int:
    """Per-turn token consumption.

    The loop stamps ``agent._last_turn_usage`` (a usage dict shaped like the
    OpenAI ``usage`` object) at the end of each run. Fall back to
    ``agent.session_total_tokens`` deltas or the result payload when the
    attribute is missing (stub agents in tests).
    """
    usage = getattr(agent, "_last_turn_usage", None)
    if usage:
        total = (
            usage.get("total_tokens")
            if isinstance(usage, dict)
            else getattr(usage, "total_tokens", None)
        )
        if total:
            return int(total)
    tokens = result.get("tokens")
    if tokens is not None:
        return int(tokens)
    return 0


class TurnRunner:
    """Drives one seat's turn through its AIAgent, mirroring streamed output.

    The runner is the only component that talks to the wrapped agent; the
    scheduler constructs the prompt (meeting context + who is on the floor)
    and passes it in. Streaming reuse: the seat's reply is mirrored verbatim
    onto the ``message.*`` pipeline so any existing message-stream renderer
    (TUI/desktop/gateway) displays seats with zero new rendering surface.
    """

    def __init__(
        self,
        seat: Seat,
        *,
        stream_emit: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ):
        self.seat = seat
        self._emit = stream_emit or _noop_stream_emit

    # ── event emission (message.* reuse) ──────────────────────────────

    def _emit_start(self, task_id: str) -> None:
        self._emit(
            EVENT_MESSAGE_START,
            {"actor_id": self.seat.seat_id, "task_id": task_id},
        )

    def _emit_delta(self, token: str, task_id: str) -> None:
        self._emit(
            EVENT_MESSAGE_DELTA,
            {"actor_id": self.seat.seat_id, "task_id": task_id, "text": token},
        )

    def _emit_complete(
        self, result: TurnResult, *, task_id: str, status: str
    ) -> None:
        self._emit(
            EVENT_MESSAGE_COMPLETE,
            {
                "actor_id": self.seat.seat_id,
                "task_id": task_id,
                "text": result.text,
                "status": status,
                "interrupted": result.interrupted,
                "turn_seq": result.turn_seq,
            },
        )

    # ── the turn ──────────────────────────────────────────────────────

    def run(
        self,
        prompt: str,
        *,
        system_message: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        task_id: Optional[str] = None,
    ) -> TurnResult:
        """Run one turn for the seat and mirror the stream onto the bus.

        Returns a ``TurnResult`` ready for the scheduler's ledger + the
        ``meeting.turn.*`` event (the scheduler owns the ledger updates).
        """
        agent = self.seat.ensure_agent()
        seq = self.seat.turn_count + 1
        self.seat.turn_count = seq
        task_id = task_id or f"{self.seat.seat_id}:{seq}:{uuid.uuid4().hex[:8]}"

        streamed = False

        def _on_stream(text: str) -> None:
            nonlocal streamed
            streamed = True
            self._emit_delta(text, task_id)

        self._emit_start(task_id)
        try:
            result: Dict[str, Any] = agent.run_conversation(
                user_message=prompt,
                system_message=system_message,
                conversation_history=conversation_history,
                task_id=task_id,
                stream_callback=_on_stream,
            )
        except Exception as exc:  # keep the seat alive across a failed turn
            out = TurnResult(
                text="",
                tokens=0,
                api_calls=0,
                completed=False,
                failed=True,
                error=f"{type(exc).__name__}: {exc}",
                turn_seq=seq,
            )
            self._emit_complete(out, task_id=task_id, status="error")
            return out

        text = str(result.get("final_response") or "").strip()
        out = TurnResult(
            text=text,
            tokens=_turn_tokens(agent, result),
            api_calls=int(result.get("api_calls") or 0),
            completed=bool(result.get("completed", True)),
            failed=bool(result.get("failed")),
            interrupted=bool(result.get("interrupted")),
            error=str(result.get("error") or ""),
            turn_seq=seq,
        )
        # Non-streaming backend: final text never flowed through _on_stream.
        # Emit it once so the UI still gets the full turn without duplicating
        # a streamed turn (streamed == True already sent the tokens).
        if not streamed and not out.interrupted and text:
            self._emit_delta(text, task_id)
        self._emit_complete(
            out,
            task_id=task_id,
            status="error" if (out.failed or out.interrupted) else "ok",
        )
        return out

    def interrupt(self, hard_cancel: bool = True) -> None:
        """Abort the running seat turn (M2 P0 wiring — passthrough to agent)."""
        agent = self.seat.ensure_agent()
        interrupter = getattr(agent, "interrupt", None)
        if interrupter is None:
            return
        interrupter(hard_cancel=hard_cancel)