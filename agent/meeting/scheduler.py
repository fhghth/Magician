"""Meeting-room M1 scheduler: rules-only round robin + triple budget (1.3).

M1 walking skeleton has no LLM moderator. The scheduler drives the room's
single logical loop synchronously — seats speak in fixed round-robin order,
each turn runs through ``TurnRunner``, and the three budgets are deducted
through the meeting row's spend columns:

* rounds  — one per turn (``store.add_spend(rounds=1)``)
* tokens  — the seat agent's per-turn usage (``TurnResult.tokens``, sourced
  from the agent's own usage ledger — NOT ``tools/budget_config.py``, which is
  a character budget for tool results)
* seconds — wall clock since meeting creation (``budget_seconds``)

The moment ANY budget is exhausted the scheduler forces convergence
(``engine.converge()``) and stops scheduling new turns. Every turn is
persisted on the append-only stream (kind="turn", actor=seat_id) so replay,
audit, and the UI can rebuild the discussion from events alone.

M2 replaces this module's loop with a FloorToken + P0–P4 priority queue; the
budget machinery and the forced-convergence path stay.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from agent.meeting.engine import MEETING_CREATED, MeetingEngine
from agent.meeting.seat import Seat, TurnResult, TurnRunner

EVENT_TURN_COMPLETE = "meeting.turn.complete"
EVENT_BUDGET_UPDATE = "meeting.budget.update"
EVENT_CONVERGING = "meeting.converging"
EVENT_MEETING_STARTED = "meeting.started"

MAX_BUDGET_DEFAULT_ROUNDS = 20  # safety ceiling when meeting has no budgets


def _noop_emit(event_type: str, payload: Dict[str, Any]) -> None:
    """Default bus sink: drop everything (headless / tests without a bus)."""


@dataclass
class BudgetState:
    """Live budget ledger for one meeting (projected, not authoritative).

    The meeting row's spent_* columns are the authority; this mirror exists
    so the scheduler can check budgets without a DB read per turn.
    """

    rounds: int = 0
    seconds: int = 0
    tokens: int = 0
    budget_rounds: Optional[int] = None
    budget_seconds: Optional[int] = None
    budget_tokens: Optional[int] = None
    started_at: float = field(default_factory=time.time)

    def exhausted(self) -> Optional[str]:
        """Return the first exhausted dimension name, or None."""
        if self.budget_rounds is not None and self.rounds >= self.budget_rounds:
            return "rounds"
        if self.budget_seconds is not None and self.seconds >= self.budget_seconds:
            return "seconds"
        if self.budget_tokens is not None and self.tokens >= self.budget_tokens:
            return "tokens"
        return None

    def remaining(self) -> Dict[str, Any]:
        return {
            "rounds": (
                max(self.budget_rounds - self.rounds, 0)
                if self.budget_rounds is not None
                else None
            ),
            "seconds": (
                max(self.budget_seconds - self.seconds, 0)
                if self.budget_seconds is not None
                else None
            ),
            "tokens": (
                max(self.budget_tokens - self.tokens, 0)
                if self.budget_tokens is not None
                else None
            ),
            "spent_rounds": self.rounds,
            "spent_tokens": self.tokens,
        }


class MeetingScheduler:
    """Rules-only round-robin driver for one meeting (M1).

    Single owner of the room loop: constructs each turn's prompt from the
    meeting context + the previous speaker's message, drives the seat through
    ``TurnRunner``, persists the turn + budget spend, and force-converges the
    moment a budget dies. Emits ``meeting.*`` metadata events (the seat's
    ``message.*`` stream already flows from TurnRunner).
    """

    def __init__(
        self,
        engine: MeetingEngine,
        seats: List[Seat],
        *,
        stream_emit: Optional[Callable[[str, Dict[str, Any]], None]] = None,
        max_rounds: Optional[int] = None,
    ):
        if not seats:
            raise ValueError("a meeting needs at least one seat")
        self.engine = engine
        self.store = engine.store
        self.seats = seats
        self._emit = stream_emit or _noop_emit
        self._turn_runner = {
            seat.seat_id: TurnRunner(seat, stream_emit=self._emit) for seat in seats
        }
        self.transcript: List[Dict[str, Any]] = []
        self._max_rounds = max_rounds or MAX_BUDGET_DEFAULT_ROUNDS

    # ── budget ─────────────────────────────────────────────────────────

    def load_budget(self) -> BudgetState:
        row = self.store.get_meeting(self.engine.meeting_id)
        if row is None:
            raise KeyError(f"meeting not found: {self.engine.meeting_id}")
        created_at = float(row["created_at"] or 0)
        return BudgetState(
            rounds=int(row["spent_rounds"] or 0),
            seconds=int(time.time() - created_at),
            tokens=int(row["spent_tokens"] or 0),
            budget_rounds=(
                int(row["budget_rounds"]) if row.get("budget_rounds") is not None else None
            ),
            budget_seconds=(
                int(row["budget_seconds"]) if row.get("budget_seconds") is not None else None
            ),
            budget_tokens=(
                int(row["budget_tokens"]) if row.get("budget_tokens") is not None else None
            ),
            started_at=created_at,
        )

    def _announce_started(self) -> None:
        """Emit the meeting metadata the UI needs to project the room."""
        row = self.store.get_meeting(self.engine.meeting_id)
        self._emit(
            EVENT_MEETING_STARTED,
            {
                "meeting_id": self.engine.meeting_id,
                "origin_ref": (row or {}).get("origin_ref"),
                "topic": (row or {}).get("topic") or "",
                "mode": (row or {}).get("mode") or "light",
                "status": self.engine.status(),
                "seats": [seat.seat_id for seat in self.seats],
            },
        )

    def _announce_budget(self, budget: BudgetState) -> None:
        payload = budget.remaining()
        payload["meeting_id"] = self.engine.meeting_id
        self._emit(EVENT_BUDGET_UPDATE, payload)

    # ── prompt construction (M1 minimal) ───────────────────────────────

    def _build_prompt(self, seat: Seat) -> str:
        """One-turn prompt for a seat.

        M1 minimal: the meeting topic + the previous speaker's message (or
        the seat's objective for the opening turn). M3 replaces this with the
        real assembly (keyframes + ledger + rolling summary + last N turns).
        """
        mid = self.engine.meeting_id
        meeting = self.store.get_meeting(mid)
        topic = (meeting or {}).get("topic") or "(无主题)"
        if not self.transcript:
            return (
                f"会议主题：{topic}\n\n"
                f"你的立场/目标：{seat.objective or seat.name}\n\n"
                "请给出你的第一轮发言（简明、有具体依据）。"
            )
        last = self.transcript[-1]
        return (
            f"会议主题：{topic}\n\n"
            f"上一位发言（{last['seat']}）：\n{last['text']}\n\n"
            f"你的立场/目标：{seat.objective or seat.name}\n\n"
            "请针对上一位发言给出你的回应。"
        )

    # ── the loop ───────────────────────────────────────────────────────

    def run(self, *, max_rounds: Optional[int] = None) -> Dict[str, Any]:
        """Drive the meeting until a budget dies or ``max_rounds`` is reached.

        Returns a summary dict {turns, exhausted, status}. Caller (M1.5
        wiring / products) decides what happens after convergence.
        """
        limit = max_rounds or self._max_rounds
        # A room starts the moment the scheduler drives it (created -> running).
        if self.engine.status() == MEETING_CREATED:
            self.engine.start(actor="scheduler")
            self._announce_started()
        budget = self.load_budget()
        self._announce_budget(budget)
        turns = 0
        exhausted: Optional[str] = None

        while turns < limit:
            exhausted = budget.exhausted()
            if exhausted is not None:
                break
            seat = self.seats[turns % len(self.seats)]
            result = self._run_one_turn(seat, budget)
            turns += 1
            if result.failed and not result.text:
                # A broken seat must not wedge the room — hand the floor on.
                continue

        exhausted = budget.exhausted() or exhausted
        if exhausted is not None:
            self._force_converge(exhausted)
        else:
            # Hit the explicit turn ceiling: converge too (M1 keeps it simple —
            # a room never lingers in running without a budget to guard it).
            self.engine.converge(actor="scheduler.max_rounds")
            self._emit(
                EVENT_CONVERGING,
                {"meeting_id": self.engine.meeting_id, "reason": "max_rounds"},
            )
        self._announce_budget(budget)
        return {
            "turns": turns,
            "exhausted": exhausted,
            "status": self.engine.status(),
            "remaining": budget.remaining(),
        }

    def _run_one_turn(self, seat: Seat, budget: BudgetState) -> TurnResult:
        runner = self._turn_runner[seat.seat_id]
        result = runner.run(self._build_prompt(seat))
        self.transcript.append({"seat": seat.seat_id, "text": result.text})
        # Persist the turn on the append-only stream (source of truth).
        self.store.emit(
            self.engine.meeting_id,
            "turn",
            actor=seat.seat_id,
            payload=result.as_dict(),
        )
        # Triple-budget deduction: rounds + tokens through the meeting row,
        # seconds computed from wall clock.
        self.store.add_spend(
            self.engine.meeting_id, rounds=1, tokens=result.tokens
        )
        budget.rounds += 1
        budget.tokens += result.tokens
        budget.seconds = int(time.time() - budget.started_at)
        self._emit(
            EVENT_TURN_COMPLETE,
            {
                "meeting_id": self.engine.meeting_id,
                "seat": seat.seat_id,
                "seq": result.turn_seq,
                "tokens": result.tokens,
                "text": result.text,
            },
        )
        self._announce_budget(budget)
        return result

    def _force_converge(self, exhausted: str) -> None:
        self.engine.converge(actor=f"scheduler.budget:{exhausted}")
        self._emit(
            EVENT_CONVERGING,
            {"meeting_id": self.engine.meeting_id, "reason": f"budget:{exhausted}"},
        )