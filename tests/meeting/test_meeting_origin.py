"""meeting.create origin resolution: the room never hard-fails "session not found".

The origin chat is a convenience, not a requirement. Covers the ladder:

* a live runtime sid (rung 1) — binds to the durable key, since ``_sessions``
  is keyed by a separate runtime sid;
* a durable key of a live session (rung 2) — the ids the desktop submits from
  its session list;
* a stored row in the launch db (rung 3), following the compression lineage to
  the live tip;
* a stored row in another profile's db (app-global remote mode);
* no session_id / an unresolvable id → a standalone room (rung 4), never an
  error, with a stable synthetic ``meeting:<mid>`` stamp id.
"""

from __future__ import annotations

import pytest

import tui_gateway.methods_meeting as mm


class FakeDB:
    def __init__(self, rows=None, tips=None):
        self.rows = dict(rows or {})
        self.tips = dict(tips or {})

    def get_session(self, sid):
        return self.rows.get(sid)

    def resolve_resume_session_id(self, sid):
        return self.tips.get(sid, sid)


class FakeSessionDB(FakeDB):
    def __init__(self, db_path=None):
        super().__init__()
        self.db_path = db_path

    def close(self):
        pass


@pytest.fixture(autouse=True)
def _rebind_globals(monkeypatch):
    # The helpers close over server.py globals that are only rebound onto the
    # module namespace at HandlerRegistry.install() time. Unit-testing the
    # pure resolution logic needs those names to exist here; raising=False
    # creates them when the module was imported without installing a server.
    monkeypatch.setattr(mm, "_sessions", {}, raising=False)
    monkeypatch.setattr(mm, "_find_live_session_by_key", lambda key: None, raising=False)
    monkeypatch.setattr(mm, "_get_db", lambda: None, raising=False)
    monkeypatch.setattr(mm, "_profile_home", lambda profile: None, raising=False)
    monkeypatch.setattr(mm, "_stored_session_runtime_overrides", lambda row: {}, raising=False)
    yield


def _standalone(mid="m1"):
    return {
        "sid": f"meeting:{mid}",
        "session_key": None,
        "live": False,
        "standalone": True,
        "cwd": None,
        "profile_home": None,
        "source": None,
        "model_override": None,
        "provider_override": None,
    }


def test_no_session_id_stands_alone():
    origin = mm._meeting_origin({"topic": "x"}, "m1")
    assert origin == _standalone()


def test_standalone_stamp_id_is_stable_and_nonempty():
    origin = mm._meeting_origin({"topic": "x"}, "m1")
    assert origin["sid"] == "meeting:m1"


def test_live_runtime_sid_binds_to_durable_key(monkeypatch):
    monkeypatch.setattr(
        mm,
        "_sessions",
        {
            "rt-1": {
                "session_key": "stored-1",
                "cwd": "/w",
                "source": "cli",
                "model_override": {"model": "gpt-x"},
            }
        },
    )
    origin = mm._meeting_origin({"session_id": "rt-1", "topic": "x"}, "m1")
    assert origin["standalone"] is False
    assert origin["sid"] == "stored-1"
    assert origin["session_key"] == "stored-1"
    assert origin["live"] is True
    assert origin["cwd"] == "/w"
    assert origin["source"] == "cli"
    assert origin["model_override"] == {"model": "gpt-x"}


def test_durable_key_of_live_session_resolves(monkeypatch):
    live = {"session_key": "stored-1", "cwd": "/w"}
    monkeypatch.setattr(mm, "_sessions", {"rt-1": live})
    monkeypatch.setattr(
        mm,
        "_find_live_session_by_key",
        lambda key: ("rt-1", live) if key == "stored-1" else None,
    )
    origin = mm._meeting_origin({"session_id": "stored-1"}, "m1")
    assert origin["standalone"] is False
    assert origin["sid"] == "stored-1"
    assert origin["session_key"] == "stored-1"
    assert origin["live"] is True
    assert origin["cwd"] == "/w"


def test_stored_row_resolves_origin(monkeypatch):
    row = {"id": "stored-1", "cwd": "/w", "source": "cli"}
    monkeypatch.setattr(mm, "_get_db", lambda: FakeDB(rows={"stored-1": row}))
    monkeypatch.setattr(
        mm,
        "_stored_session_runtime_overrides",
        lambda r: {"model_override": {"model": "grok-4", "provider": "x"}},
    )
    origin = mm._meeting_origin({"session_id": "stored-1"}, "m1")
    assert origin["standalone"] is False
    assert origin["sid"] == "stored-1"
    assert origin["session_key"] == "stored-1"
    assert origin["live"] is False
    assert origin["cwd"] == "/w"
    assert origin["source"] == "cli"
    assert origin["model_override"] == {"model": "grok-4", "provider": "x"}


def test_compression_lineage_redirects_to_live_tip(monkeypatch):
    tip = {"session_key": "tip-2", "cwd": "/t"}
    monkeypatch.setattr(mm, "_sessions", {"rt-9": tip})
    monkeypatch.setattr(
        mm,
        "_find_live_session_by_key",
        lambda key: ("rt-9", tip) if key == "tip-2" else None,
    )
    monkeypatch.setattr(
        mm,
        "_get_db",
        lambda: FakeDB(rows={"old-1": {"id": "old-1"}}, tips={"old-1": "tip-2"}),
    )
    origin = mm._meeting_origin({"session_id": "old-1"}, "m1")
    assert origin["standalone"] is False
    assert origin["sid"] == "tip-2"
    assert origin["session_key"] == "tip-2"
    assert origin["live"] is True


def test_cross_profile_row_resolves_with_its_home(monkeypatch, tmp_path):
    import hermes_state

    row = {"id": "p2-s", "cwd": "/p2", "source": "cli"}
    monkeypatch.setattr(
        mm,
        "_profile_home",
        lambda p: tmp_path / "p2" if p == "coder" else None,
    )

    class ProfileSessionDB(FakeSessionDB):
        def __init__(self, db_path=None):
            super().__init__(db_path=db_path)
            self.rows["p2-s"] = row

    monkeypatch.setattr(hermes_state, "SessionDB", ProfileSessionDB)
    origin = mm._meeting_origin({"session_id": "p2-s", "profile": "coder"}, "m1")
    assert origin["standalone"] is False
    assert origin["sid"] == "p2-s"
    assert origin["profile_home"] == str(tmp_path / "p2")
    assert origin["live"] is False


def test_unresolvable_session_id_stands_alone():
    origin = mm._meeting_origin({"session_id": "ghost"}, "m1")
    assert origin == _standalone()
    assert origin["standalone"] is True


# ── dispatch smoke: the real installed meeting.create handler ────────────────
# Exercises the installed handler's globals (server namespace) rather than the
# module-local helpers, proving the RPC never answers "session not found".


@pytest.fixture(scope="module")
def server():
    import importlib

    from unittest.mock import MagicMock, patch

    with patch.dict(
        "sys.modules",
        {
            "hermes_constants": MagicMock(get_hermes_home=MagicMock(return_value="/tmp/hermes_test")),
            "hermes_cli.env_loader": MagicMock(),
            "hermes_cli.banner": MagicMock(),
            "hermes_state": MagicMock(),
        },
    ):
        mod = importlib.import_module("tui_gateway.server")

    methods = dict(mod._methods)
    yield mod
    mod._methods.clear()
    mod._methods.update(methods)


def _dispatch_create(server, params, monkeypatch):
    def _noop(*args, **kwargs):
        pass

    # Keep the driver thread inert — the smoke test only proves the request
    # path answers, not that seats materialize. The sys.modules hermes_state
    # mock would make every stored-row lookup truthy, so model "no database
    # available" to exercise the unresolvable/standalone rung honestly.
    monkeypatch.setattr(server, "_run_meeting", _noop)
    monkeypatch.setattr(server, "_get_db", lambda: None)
    return server._methods["meeting.create"]("rid-1", params)


def test_dispatch_standalone_never_says_session_not_found(server, monkeypatch):
    result = _dispatch_create(server, {"topic": "Standalone", "session_id": "ghost"}, monkeypatch)
    assert result.get("error") is None
    assert result["result"]["standalone"] is True
    assert result["result"]["origin_sid"].startswith("meeting:")
    assert result["result"]["status"] == "created"


def test_dispatch_without_session_id_stands_alone(server, monkeypatch):
    result = _dispatch_create(server, {"topic": "No chat at all"}, monkeypatch)
    assert result.get("error") is None
    assert result["result"]["standalone"] is True


def test_dispatch_live_runtime_sid_stamps_durable_key(server, monkeypatch):
    server._sessions["rt-1"] = {"session_key": "stored-1", "cwd": "/w", "source": "cli"}
    try:
        result = _dispatch_create(server, {"topic": "Bound", "session_id": "rt-1"}, monkeypatch)
        assert result.get("error") is None
        assert result["result"]["standalone"] is False
        assert result["result"]["origin_sid"] == "stored-1"
    finally:
        server._sessions.pop("rt-1", None)


def test_dispatch_durable_key_of_live_session_answers(server, monkeypatch):
    server._sessions["rt-2"] = {"session_key": "stored-2", "cwd": "/w2"}
    try:
        result = _dispatch_create(server, {"topic": "Bound", "session_id": "stored-2"}, monkeypatch)
        assert result.get("error") is None
        assert result["result"]["standalone"] is False
        assert result["result"]["origin_sid"] == "stored-2"
    finally:
        server._sessions.pop("rt-2", None)
