"""M1 1.4 acceptance: minutes + conclusion return packet.

Covers dev-guide M1.4 DoD:
* 1.4a  mechanical, zero-token minutes built from the turn stream, persisted
        as a ledger entry (kind="minutes") + meeting.minutes event.
* 1.4b  finalize assembles the MeetingReturnPacket (decisions + contract +
        open_items + stats) and appends meeting.conclusion.
* 1.4c  origin_ref=thread:<id> writes a SessionMessage with
        display_kind="meeting_conclusion" back into the originating thread
        (open union in types/hermes.ts — no core type change); a missing or
        non-thread origin only emits the event and never breaks closure.
"""

from __future__ import annotations

import json

import pytest

from agent.meeting.engine import MeetingEngine
from agent.meeting.products import (
    DISPLAY_KIND_CONCLUSION,
    EVENT_CONCLUSION,
    EVENT_MINUTES,
    MeetingProducts,
    MeetingReturnPacket,
    parse_origin_ref,
)
from agent.meeting.store import MeetingStore
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


def _meeting_with_turns(store, *, origin_ref=None, topic="t"):
    mid = store.create_meeting(topic=topic, origin_ref=origin_ref)
    # Two turns recorded the way the scheduler persists them.
    for seat, text, tokens in (("s0", "第一轮发言", 5), ("s1", "第二轮发言", 7)):
        store.emit(mid, "turn", actor=seat, payload={"text": text, "tokens": tokens})
        store.add_spend(mid, rounds=1, tokens=tokens)
    return mid


class TestParseOriginRef:
    def test_thread_ref(self):
        assert parse_origin_ref("thread:abc123") == {"kind": "thread", "value": "abc123"}

    def test_kanban_ref(self):
        assert parse_origin_ref("kanban:card:yyy") == {"kind": "kanban", "value": "card:yyy"}

    def test_subagent_ref(self):
        assert parse_origin_ref("subagent:zzz") == {"kind": "subagent", "value": "zzz"}

    def test_malformed(self):
        assert parse_origin_ref(None) is None
        assert parse_origin_ref("") is None
        assert parse_origin_ref("no-colon") is None
        assert parse_origin_ref("thread:") is None


class TestMinutes:
    def test_minutes_text_built_from_turns(self, store):
        mid = _meeting_with_turns(store, topic="Bug 会诊")
        prods = MeetingProducts(MeetingEngine(store, mid))
        text = prods.build_minutes_text()
        assert "Bug 会诊" in text
        assert "[s0] 第一轮发言" in text
        assert "[s1] 第二轮发言" in text
        assert "回合数 2" in text

    def test_minutes_persist_ledger_and_event(self, store):
        mid = _meeting_with_turns(store)
        prods = MeetingProducts(MeetingEngine(store, mid))
        lid = prods.persist_minutes("minute text")
        assert lid
        ledger = store.list_ledger(mid)
        assert ledger[0]["kind"] == "minutes"
        assert ledger[0]["value"]["text"] == "minute text"
        kinds = [e["kind"] for e in store.get_events(mid)]
        assert EVENT_MINUTES in kinds


class TestConclusion:
    def test_packet_shape(self, store):
        mid = _meeting_with_turns(store, origin_ref="thread:sess1")
        prods = MeetingProducts(MeetingEngine(store, mid))
        packet = prods.build_packet(contract="c")
        assert isinstance(packet, MeetingReturnPacket)
        d = packet.as_dict()
        assert d["origin_ref"] == "thread:sess1"
        assert d["topic"] == "t"
        assert d["stats"]["turns"] == 2
        assert d["stats"]["tokens"] == 12
        assert d["stats"]["rounds"] == 2
        assert d["stats"]["seats"] == 2

    def test_finalize_emits_conclusion(self, store):
        mid = _meeting_with_turns(store)
        prods = MeetingProducts(MeetingEngine(store, mid))
        packet = prods.finalize()
        kinds = [e["kind"] for e in store.get_events(mid)]
        assert EVENT_CONCLUSION in kinds
        assert EVENT_MINUTES in kinds
        assert packet.meeting_id == mid

    def test_open_items_counts_unsigned_ledger(self, store):
        mid = _meeting_with_turns(store)
        store.add_ledger(
            mid, kind="decision", value={"goal": "a"},
            source_msg_id="m1", status="proposed",
        )
        store.add_ledger(
            mid, kind="decision", value={"goal": "b"},
            source_msg_id="m2", status="signed",
        )
        store.add_ledger(
            mid, kind="decision", value={"goal": "c"},
            source_msg_id="m3", status="vetoed",
        )
        prods = MeetingProducts(MeetingEngine(store, mid))
        packet = prods.build_packet()
        assert packet.open_items == 1  # only the proposed one
        assert len(packet.decisions) == 3

    def test_finalize_writes_thread_card(self, store, db):
        db.create_session("sess1", source="cli")
        mid = _meeting_with_turns(store, origin_ref="thread:sess1")
        prods = MeetingProducts(MeetingEngine(store, mid))
        prods.finalize()
        with db._read_ctx() as conn:
            rows = conn.execute(
                "SELECT role, content, display_kind, display_metadata "
                "FROM messages WHERE session_id = ? AND display_kind = ?",
                ("sess1", DISPLAY_KIND_CONCLUSION),
            ).fetchall()
        assert len(rows) == 1
        row = dict(rows[0])
        assert row["role"] == "user"
        assert "会议纪要" in row["content"]
        meta = row["display_metadata"]
        assert meta is not None
        assert json.loads(meta)["meeting_id"] == mid

    def test_finalize_no_thread_origin_still_emits(self, store):
        mid = _meeting_with_turns(store)  # origin_ref=None
        prods = MeetingProducts(MeetingEngine(store, mid))
        packet = prods.finalize()
        assert packet.origin_ref is None
        kinds = [e["kind"] for e in store.get_events(mid)]
        assert EVENT_CONCLUSION in kinds

    def test_finalize_missing_thread_session_does_not_raise(self, store):
        mid = _meeting_with_turns(store, origin_ref="thread:ghost-session")
        prods = MeetingProducts(MeetingEngine(store, mid))
        packet = prods.finalize()  # must not raise
        assert packet.meeting_id == mid


class TestStats:
    def test_stats_from_row(self, store):
        mid = _meeting_with_turns(store)
        prods = MeetingProducts(MeetingEngine(store, mid))
        stats = prods.stats()
        assert stats.turns == 2
        assert stats.tokens == 12
        assert stats.rounds == 2
        assert stats.seats == 2

    def test_missing_meeting_raises(self, store):
        prods = MeetingProducts(MeetingEngine(store, "nope"))
        with pytest.raises(KeyError):
            prods.stats()