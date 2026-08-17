"""Meeting-room products: minutes + conclusion return packet (M1 1.4).

M1 minimal, zero-token: minutes are built mechanically from the append-only
``meeting_events`` stream (turn events only — no LLM summarizer; M3's
recorder/ledger machinery and M4's product gate are later milestones). On
finalize:

* ``build_minutes()`` — account-level minutes (per-seat turn transcript +
  stats) persisted as a ``meeting_ledger`` entry (kind="minutes") and appended
  as a ``meeting.minutes`` event.
* ``finalize()`` — assembles the ``MeetingReturnPacket`` (decisions 逐字段 +
  contract 摘要 + open_items 计数 + stats), appends ``meeting.conclusion``,
  and — when the meeting was created from a conversation
  (``origin_ref=thread:<session_id>``) — writes a SessionMessage with
  ``display_kind="meeting_conclusion"`` so the conclusion shows up as a rich
  card back in the originating thread (open union in types/hermes.ts, no core
  type change).

The write path reuses the wrapped ``SessionDB`` connection (``store._db``) —
no new sqlite connection is ever opened.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agent.meeting.engine import MeetingEngine
from agent.meeting.store import MeetingStore

EVENT_MINUTES = "meeting.minutes"
EVENT_CONCLUSION = "meeting.conclusion"

DISPLAY_KIND_CONCLUSION = "meeting_conclusion"

# Cap on the message content written back into the originating thread. The
# full transcript stays in meeting_events and is retrievable via meeting RPCs;
# the card is a summary affordance, not a second copy of the record.
_THREAD_CARD_CONTENT_CAP = 4000


@dataclass
class MeetingStats:
    turns: int = 0
    tokens: int = 0
    rounds: int = 0
    seats: int = 0
    seconds: float = 0.0
    status: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "turns": self.turns,
            "tokens": self.tokens,
            "rounds": self.rounds,
            "seats": self.seats,
            "seconds": round(self.seconds, 1),
            "status": self.status,
        }


@dataclass
class MeetingReturnPacket:
    """Structured conclusion returned to the originating surface (WS6).

    decisions: ledger entries, field by field (逐字段) — M1 has none yet
               (the decision ledger is M4), so this is the stream of turns.
    contract:  the minutes summary text.
    open_items: count of unresolved ledger entries (status not signed/vetoed).
    stats:     MeetingStats.
    """

    meeting_id: str
    origin_ref: Optional[str] = None
    topic: str = ""
    decisions: List[Dict[str, Any]] = field(default_factory=list)
    contract: str = ""
    open_items: int = 0
    stats: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "meeting_id": self.meeting_id,
            "origin_ref": self.origin_ref,
            "topic": self.topic,
            "decisions": self.decisions,
            "contract": self.contract,
            "open_items": self.open_items,
            "stats": self.stats,
        }


def parse_origin_ref(origin_ref: Optional[str]) -> Optional[Dict[str, str]]:
    """Split ``thread:xxx`` / ``kanban:card:yyy`` / ``subagent:zzz``.

    Returns None for empty/malformed refs. M1 only consumes ``thread:*``.
    """
    if not origin_ref or ":" not in origin_ref:
        return None
    kind, _, value = origin_ref.partition(":")
    if not kind or not value:
        return None
    return {"kind": kind, "value": value}


class MeetingProducts:
    """Builds minutes + the conclusion packet for one meeting.

    Constructed per finalize (cheap); the engine is only consulted for its
    meeting id — products never transitions status itself (the caller closes
    the room after products succeed).
    """

    def __init__(self, engine: MeetingEngine):
        self.engine = engine
        self.store: MeetingStore = engine.store
        self.meeting_id = engine.meeting_id

    # ── helpers ────────────────────────────────────────────────────────

    def _meeting_row(self) -> Dict[str, Any]:
        row = self.store.get_meeting(self.meeting_id)
        if row is None:
            raise KeyError(f"meeting not found: {self.meeting_id}")
        return row

    def _turns(self) -> List[Dict[str, Any]]:
        return [
            e for e in self.store.get_events(self.meeting_id) if e["kind"] == "turn"
        ]

    def stats(self) -> MeetingStats:
        row = self._meeting_row()
        turns = self._turns()
        seats = {
            e["actor"] for e in turns
        }
        elapsed = 0.0
        try:
            elapsed = max(float(time.time()) - float(row["created_at"] or 0), 0.0)
        except (TypeError, ValueError):
            elapsed = 0.0
        return MeetingStats(
            turns=len(turns),
            tokens=int(row["spent_tokens"] or 0),
            rounds=int(row["spent_rounds"] or 0),
            seats=len(seats),
            seconds=elapsed,
            status=row["status"],
        )

    # ── minutes ───────────────────────────────────────────────────────

    def build_minutes_text(self, turns: Optional[List[Dict[str, Any]]] = None) -> str:
        """Mechanical, zero-token minutes from the turn stream."""
        turns = turns if turns is not None else self._turns()
        row = self._meeting_row()
        lines = [f"会议纪要 — {row['topic']}", ""]
        if not turns:
            lines.append("（无发言记录）")
        for t in turns:
            text = (t.get("payload") or {}).get("text") or ""
            lines.append(f"[{t['actor']}] {text}")
        stats = self.stats()
        lines.append("")
        lines.append(f"回合数 {stats.turns} · 席位 {stats.seats} · "
                     f"tokens {stats.tokens}")
        return "\n".join(lines)

    def persist_minutes(self, text: str) -> str:
        """Write minutes as a ledger entry + stream event. Returns ledger id."""
        ledger_id = self.store.add_ledger(
            self.meeting_id,
            kind="minutes",
            value={"text": text},
            source_msg_id=self.meeting_id,
            status="proposed",
        )
        self.store.emit(
            self.meeting_id,
            EVENT_MINUTES,
            actor="system.products",
            payload={"meeting_id": self.meeting_id, "ledger_id": ledger_id, "text": text},
        )
        return ledger_id

    # ── conclusion ────────────────────────────────────────────────────

    def build_packet(self, contract: str = "") -> MeetingReturnPacket:
        row = self._meeting_row()
        turns = self._turns()
        ledger = self.store.list_ledger(self.meeting_id)
        decisions = [
            {"kind": e.get("kind"), "value": e.get("value"), "status": e.get("status")}
            for e in ledger
            if e.get("kind") and e.get("kind") != "minutes"
        ]
        open_items = sum(
            1
            for e in ledger
            if e.get("status") not in ("signed", "vetoed")
            and e.get("kind") != "minutes"
        )
        return MeetingReturnPacket(
            meeting_id=self.meeting_id,
            origin_ref=row.get("origin_ref"),
            topic=row.get("topic") or "",
            decisions=decisions,
            contract=contract,
            open_items=open_items,
            stats=self.stats().as_dict(),
        )

    def finalize(self) -> MeetingReturnPacket:
        """Persist minutes, append the conclusion event, write back to thread.

        Returns the assembled packet. Does NOT transition the meeting status
        — the caller (scheduler/closure wiring) runs ``engine.close()`` after
        products succeed.
        """
        minutes_text = self.build_minutes_text()
        self.persist_minutes(minutes_text)
        packet = self.build_packet(contract=minutes_text)
        self.store.emit(
            self.meeting_id,
            EVENT_CONCLUSION,
            actor="system.products",
            payload=packet.as_dict(),
        )
        ref = parse_origin_ref(packet.origin_ref)
        if ref and ref["kind"] == "thread":
            self._write_thread_card(ref["value"], packet)
        return packet

    def _write_thread_card(
        self, session_id: str, packet: MeetingReturnPacket
    ) -> Optional[int]:
        """Append the conclusion as a SessionMessage into the origin thread."""
        db = getattr(self.store, "_db", None)
        append = getattr(db, "append_message", None)
        if append is None:
            return None
        content = packet.contract[: _THREAD_CARD_CONTENT_CAP] or packet.topic
        try:
            return append(
                session_id,
                "user",
                content=content,
                display_kind=DISPLAY_KIND_CONCLUSION,
                display_metadata={
                    "meeting_id": packet.meeting_id,
                    "origin_ref": packet.origin_ref,
                    "topic": packet.topic,
                    "open_items": packet.open_items,
                    "stats": packet.stats,
                    "decisions_count": len(packet.decisions),
                },
            )
        except Exception:
            # A missing thread session must not fail the closure; the
            # conclusion event on the meeting stream is the durable record.
            return None