"""M0 acceptance: meeting-room tables land via the state DB migration
mechanism, and the DAO layer is safe under concurrent append writes.

Covers dev-guide M0 DoD:
* 0.1  migration — the five tables appear on a fresh open AND on a legacy
       DB (existing state.db without the tables) — no manual migration step.
* 0.2  store DAO writes reuse the existing SessionDB connection management
       (same connection, BEGIN IMMEDIATE, jitter retry) — no new sqlite
       connections are opened by the DAO itself.
* 0.3  emit() guarantees per-meeting monotonically increasing, contiguous
       seq even under concurrent writers from multiple threads.
"""

from __future__ import annotations

import json
import sqlite3
import threading

import pytest

from agent.meeting.store import (
    MEETING_ABORTED,
    MEETING_CREATED,
    MEETING_RUNNING,
    MeetingStore,
)
from hermes_state import SessionDB

MEETING_TABLES = (
    "meetings",
    "meeting_events",
    "meeting_keyframes",
    "meeting_ledger",
    "meeting_claims",
)

# Indexes declared in SCHEMA_SQL alongside the meeting tables.
MEETING_INDEXES = (
    "idx_meeting_events_seq",
    "idx_meeting_keyframes_meeting",
    "idx_meeting_ledger_meeting",
    "idx_meeting_claims_msg",
)


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


def _table_names(conn: sqlite3.Connection) -> set:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {r[0] for r in rows}


def _index_names(conn: sqlite3.Connection) -> set:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'"
    ).fetchall()
    return {r[0] for r in rows}


def _event_rows(conn: sqlite3.Connection, meeting_id: str):
    return conn.execute(
        "SELECT seq, kind, actor FROM meeting_events "
        "WHERE meeting_id = ? ORDER BY seq ASC",
        (meeting_id,),
    ).fetchall()


class TestMigration:
    """0.1 — tables land through the existing state DB migration mechanism."""

    def test_fresh_db_has_all_meeting_tables(self, tmp_path):
        db = SessionDB(db_path=tmp_path / "fresh.db")
        try:
            with db._read_ctx() as conn:
                tables = _table_names(conn)
                assert MEETING_TABLES[0] in tables
                assert set(MEETING_TABLES) <= tables, (
                    f"missing meeting tables: {set(MEETING_TABLES) - tables}"
                )
        finally:
            db.close()

    def test_fresh_db_has_meeting_indexes(self, tmp_path):
        db = SessionDB(db_path=tmp_path / "fresh.db")
        try:
            with db._read_ctx() as conn:
                indexes = _index_names(conn)
                assert set(MEETING_INDEXES) <= indexes, (
                    f"missing meeting indexes: {set(MEETING_INDEXES) - indexes}"
                )
        finally:
            db.close()

    def test_legacy_db_gains_meeting_tables_on_open(self, tmp_path):
        """An existing state.db that predates the meeting feature gets the
        five tables on the next SessionDB open (CREATE TABLE IF NOT EXISTS
        via SCHEMA_SQL executescript) — no manual migration step."""
        from hermes_state_common import SCHEMA_SQL as _CURRENT_SCHEMA_SQL

        path = tmp_path / "state.db"
        conn = sqlite3.connect(str(path))
        conn.executescript(_CURRENT_SCHEMA_SQL)
        # Simulate a pre-meeting install: valid full schema, then drop every
        # meeting artifact so the database predates the feature.
        for table in MEETING_TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
        for index in MEETING_INDEXES:
            conn.execute(f"DROP INDEX IF EXISTS {index}")
        conn.commit()
        conn.close()

        probe = sqlite3.connect(str(path))
        assert "meetings" not in _table_names(probe)
        probe.close()

        db = SessionDB(db_path=path)
        try:
            with db._read_ctx() as read_conn:
                tables = _table_names(read_conn)
                assert set(MEETING_TABLES) <= tables
                indexes = _index_names(read_conn)
                assert set(MEETING_INDEXES) <= indexes
        finally:
            db.close()

    def test_meetings_status_column_defaults_and_p2_reserved_columns(
        self, tmp_path
    ):
        """The DDL carries the P2-reserved columns and the interrupted
        status contract (implementation doc §2 / WS0-5)."""
        db = SessionDB(db_path=tmp_path / "state.db")
        try:
            with db._read_ctx() as conn:
                cols = {
                    r[1]
                    for r in conn.execute('PRAGMA table_info("meetings")')
                }
                assert {"delegation_profile_id", "project_id", "worktree_path"} <= cols
                event_cols = {
                    r[1]
                    for r in conn.execute('PRAGMA table_info("meeting_events")')
                }
                assert {"intent", "pre_state_ref"} <= event_cols
        finally:
            db.close()


class TestMeetingCrud:
    """0.2 — DAO read/write across the five tables."""

    def test_create_and_get_meeting(self, store):
        mid = store.create_meeting(
            origin_ref="thread:abc",
            topic="Bug 会诊：测试反复失败",
            mode="light",
            budget_rounds=10,
            budget_seconds=300,
            budget_tokens=100_000,
        )
        assert mid
        row = store.get_meeting(mid)
        assert row["topic"] == "Bug 会诊：测试反复失败"
        assert row["mode"] == "light"
        assert row["status"] == MEETING_CREATED
        assert row["spent_rounds"] == 0
        assert row["spent_tokens"] == 0
        assert row["budget_rounds"] == 10
        assert row["budget_seconds"] == 300
        assert row["budget_tokens"] == 100_000

    def test_status_transition_records_event(self, store):
        mid = store.create_meeting(topic="t")
        store.set_meeting_status(mid, MEETING_RUNNING)
        row = store.get_meeting(mid)
        assert row["status"] == MEETING_RUNNING
        events = store.get_events(mid)
        assert [e["kind"] for e in events] == ["status"]
        assert events[0]["payload"]["to"] == MEETING_RUNNING

    def test_invalid_status_rejected(self, store):
        mid = store.create_meeting(topic="t")
        with pytest.raises(ValueError):
            store.set_meeting_status(mid, "not-a-status")
        with pytest.raises(ValueError):
            store.create_meeting(topic="t", status="nope")

    def test_add_spend_accumulates(self, store):
        mid = store.create_meeting(topic="t")
        store.add_spend(mid, rounds=1, tokens=1500)
        store.add_spend(mid, rounds=2, tokens=500)
        row = store.get_meeting(mid)
        assert row["spent_rounds"] == 3
        assert row["spent_tokens"] == 2000

    def test_list_meetings_filters_by_status(self, store):
        a = store.create_meeting(topic="a")
        b = store.create_meeting(topic="b")
        store.set_meeting_status(a, MEETING_ABORTED, emit_event=False)
        ids = {m["id"] for m in store.list_meetings(status=MEETING_ABORTED)}
        assert ids == {a}
        ids = {m["id"] for m in store.list_meetings(status=MEETING_CREATED)}
        assert ids == {b}

    def test_keyframes_ledger_claims_roundtrip(self, store):
        mid = store.create_meeting(topic="t")
        kid = store.add_keyframe(
            mid,
            source_msg_id="evt-1",
            text="预算上限 100k token，以该数字为准",
            clearance="public",
            source="rule",
        )
        assert kid
        frames = store.list_keyframes(mid)
        assert len(frames) == 1
        assert frames[0]["status"] == "candidate"
        store.set_keyframe_status(kid, "pinned")
        assert store.list_keyframes(mid, status="pinned")[0]["id"] == kid

        lid = store.add_ledger(
            mid,
            kind="number",
            value={"label": "预算上限", "value": 100000, "unit": "token"},
            source_msg_id="evt-2",
            status="proposed",
        )
        entry = store.list_ledger(mid)[0]
        assert entry["value"]["value"] == 100000
        assert store.ledger_value(mid, "number")["value"] == 100000

        cid = store.add_claim(
            msg_id="evt-2",
            claim_text="预算上限为 100000 token",
            claim_class="fact",
            citation="tests/fixtures/budget.md:12",
            verify_status="ok",
        )
        assert cid
        claims = store.list_claims(msg_id="evt-2")
        assert len(claims) == 1
        assert claims[0]["class"] == "fact"
        assert claims[0]["declared_by"] == "speaker"


class TestEmitSeq:
    """0.3 — emit() is the single write entry and seq is monotonic."""

    def test_seq_starts_at_one_and_increments(self, store):
        mid = store.create_meeting(topic="t")
        for i in range(1, 5):
            evt = store.emit(mid, "turn", actor=f"seat-{i % 2}")
            assert evt["seq"] == i
        events = store.get_events(mid)
        assert [e["seq"] for e in events] == [1, 2, 3, 4]

    def test_seq_is_per_meeting(self, store):
        a = store.create_meeting(topic="a")
        b = store.create_meeting(topic="b")
        assert store.emit(a, "turn").get("seq") == 1
        assert store.emit(b, "turn").get("seq") == 1
        assert store.emit(a, "turn").get("seq") == 2
        assert store.emit(b, "turn").get("seq") == 2

    def test_emit_payload_roundtrip_as_dict(self, store):
        mid = store.create_meeting(topic="t")
        evt = store.emit(
            mid, "claim", actor="seat-0",
            payload={"text": "含中文 payload", "n": 42},
            intent="transcribe",
            pre_state_ref="abc123",
        )
        assert evt["payload"]["text"] == "含中文 payload"
        assert evt["intent"] == "transcribe"
        events = store.get_events(mid)
        assert events[0]["payload"] == {"text": "含中文 payload", "n": 42}

    def test_events_ordered_by_seq_for_replay(self, store):
        mid = store.create_meeting(topic="t")
        store.emit(mid, "a", actor="x")
        store.emit(mid, "b", actor="y")
        store.emit(mid, "c", actor="z")
        kinds = [e["kind"] for e in store.get_events(mid)]
        assert kinds == ["a", "b", "c"]
        # after_seq incremental replay
        tail = [e["kind"] for e in store.get_events(mid, after_seq=1)]
        assert tail == ["b", "c"]
        assert store.get_max_seq(mid) == 3

    def test_events_are_append_only(self, store):
        mid = store.create_meeting(topic="t")
        store.emit(mid, "a", actor="x")
        store.emit(mid, "b", actor="y")
        # The DAO exposes no delete/update surface for events (Tier 0:
        # append-only). Rows survive exactly as written.
        assert len(store.get_events(mid)) == 2
        assert not hasattr(store, "delete_event")
        assert not hasattr(store, "update_event")


class TestConcurrentAppend:
    """M0 测试红线: concurrent appends must not deadlock or reorder."""

    def test_concurrent_emits_are_contiguous_and_ordered(self, db, store):
        mid = store.create_meeting(topic="t")
        n_threads = 4
        per_thread = 25
        errors: list = []

        def worker(tid: int) -> None:
            try:
                for i in range(per_thread):
                    store.emit(mid, "turn", actor=f"seat-{tid}", payload={"i": i})
            except Exception as exc:  # pragma: no cover
                errors.append(exc)

        threads = [
            threading.Thread(target=worker, args=(tid,)) for tid in range(n_threads)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
        assert not errors, f"concurrent emits failed: {errors}"

        events = store.get_events(mid)
        # Total order: seq is strictly 1..N (contiguous, no gaps, no dupes).
        seqs = [e["seq"] for e in events]
        assert seqs == list(range(1, n_threads * per_thread + 1)), (
            f"seq not contiguous: {seqs[:10]}... len={len(seqs)}"
        )
        # Per-meeting monotonicity holds inside the DB too.
        with db._read_ctx() as conn:
            rows = _event_rows(conn, mid)
        assert [r[0] for r in rows] == seqs

    def test_concurrent_emits_across_meetings_do_not_cross(self, db, store):
        a = store.create_meeting(topic="a")
        b = store.create_meeting(topic="b")
        errors: list = []

        def worker(mid: str, tid: int) -> None:
            try:
                for i in range(20):
                    store.emit(mid, "turn", actor=f"seat-{tid}")
            except Exception as exc:  # pragma: no cover
                errors.append(exc)

        threads = [
            threading.Thread(target=worker, args=(a if i % 2 == 0 else b, i))
            for i in range(6)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
        assert not errors
        for mid in (a, b):
            seqs = [e["seq"] for e in store.get_events(mid)]
            assert seqs == list(range(1, len(seqs) + 1))


class TestConnectionReuse:
    """0.2 — the DAO must not open its own sqlite connections."""

    def test_store_holds_one_reference_to_the_session_db(self, store, db):
        assert store._db is db

    def test_events_survive_reopen(self, tmp_path):
        path = tmp_path / "state.db"
        db = SessionDB(db_path=path)
        store = MeetingStore(db)
        mid = store.create_meeting(topic="persist")
        store.emit(mid, "turn", actor="seat-0", payload={"text": "hello"})
        db.close()

        reopened = SessionDB(db_path=path)
        try:
            events = MeetingStore(reopened).get_events(mid)
            # create_meeting records nothing; only the turn was emitted.
            assert len(events) == 1
            assert events[0]["payload"]["text"] == "hello"
        finally:
            reopened.close()
