"""RPC tests for agent presets (preset.list / preset.apply).

Covers the desktop-facing surface: discovery over the wire, validation,
per-session persistence, and the live recompose (agent swap + session.info
event) — the seam the desktop picker depends on.
"""

from __future__ import annotations

import importlib
import threading

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def server():
    # Mocks are scoped to the initial import only (see
    # tests/tui_gateway/test_protocol.py for the rationale).
    with patch.dict(
        "sys.modules",
        {
            "hermes_constants": MagicMock(
                get_hermes_home=MagicMock(return_value="/tmp/hermes_test_presets")
            ),
            "hermes_cli.env_loader": MagicMock(),
            "hermes_cli.banner": MagicMock(),
            "hermes_state": MagicMock(),
        },
    ):
        mod = importlib.import_module("tui_gateway.server")
    yield mod


def _ok(result: dict) -> dict:
    assert "result" in result, result
    return result.get("result") or {}


def _err(result: dict) -> dict:
    assert "error" in result, result
    return result.get("error") or {}


def _call(server, method: str, params: dict) -> dict:
    handler = server._methods[method]
    return handler("rid-1", params)


def test_preset_list_returns_shipped_presets(server):
    out = _ok(_call(server, "preset.list", {}))
    ids = [p["id"] for p in out["presets"]]
    assert "minimal" in ids
    assert "standard" in ids
    assert "code" in ids
    # Discovery is first-root-wins: the shipped set must be intact.
    assert "creative" in ids
    for preset in out["presets"]:
        assert isinstance(preset["id"], str)
        assert isinstance(preset["name"], str)
        assert isinstance(preset["broken"], bool)
        assert isinstance(preset["toolset_summary"], str)


def test_preset_list_reports_config_default(server):
    server._load_cfg = MagicMock(return_value={"agent_presets": {"default": "minimal"}})
    out = _ok(_call(server, "preset.list", {}))
    assert out["default"] == "minimal"


def test_preset_list_default_empty_when_unset(server):
    server._load_cfg = MagicMock(return_value={})
    out = _ok(_call(server, "preset.list", {}))
    assert out["default"] == ""


def test_preset_apply_requires_params(server):
    out = _call(server, "preset.apply", {})
    assert _err(out)["code"] == 4006
    out = _call(server, "preset.apply", {"preset_id": "minimal"})
    assert _err(out)["code"] == 4006
    out = _call(server, "preset.apply", {"session_id": "s1"})
    assert _err(out)["code"] == 4006


def test_preset_apply_rejects_unknown_preset(server):
    out = _call(server, "preset.apply", {"session_id": "s1", "preset_id": "nope-123"})
    assert _err(out)["code"] == 4006
    assert "unknown preset" in _err(out)["message"]


def test_preset_apply_persists_to_session_db(server):
    db = MagicMock()
    db.get_session = MagicMock(return_value={"id": "s1", "message_count": 0})
    server._get_db = MagicMock(return_value=db)
    server._find_live_session_by_key = MagicMock(return_value=None)
    out = _ok(_call(server, "preset.apply", {"session_id": "s1", "preset_id": "code"}))
    db.set_session_agent_preset.assert_called_once_with("s1", "code")
    assert out == {"applied": True, "recomposed": False}


def test_preset_apply_rejects_session_with_history(server):
    # Harness blank-session rule: a preset may only be swapped while the
    # session is still blank. A session that already produced messages is
    # fixed — swapping tools mid-conversation would leave logged tool calls
    # the new composition cannot make.
    db = MagicMock()
    db.get_session = MagicMock(return_value={"id": "s1", "message_count": 3})
    server._get_db = MagicMock(return_value=db)
    server._find_live_session_by_key = MagicMock(return_value=None)
    out = _call(server, "preset.apply", {"session_id": "s1", "preset_id": "minimal"})
    assert _err(out)["code"] == 4010
    db.set_session_agent_preset.assert_not_called()


def test_preset_apply_busy_session_is_deferred(server):
    agent = MagicMock()
    agent._agent_preset_id = "standard"
    db = MagicMock()
    db.get_session = MagicMock(return_value={"id": "s1", "message_count": 0})
    session = {
        "agent": agent,
        "session_key": "s1",
        "running": True,
        "model_override": None,
    }
    server._get_db = MagicMock(return_value=db)
    server._find_live_session_by_key = MagicMock(return_value=("sid1", session))
    out = _call(server, "preset.apply", {"session_id": "s1", "preset_id": "minimal"})
    assert _err(out)["code"] == 4009
    # The DB write still lands — the pick applies at the next turn start.
    db.set_session_agent_preset.assert_called_once_with("s1", "minimal")


def test_preset_apply_recomposes_live_session(server, monkeypatch):
    old_agent = MagicMock()
    old_agent._agent_preset_id = "standard"
    new_agent = MagicMock()
    new_agent._agent_preset_id = "minimal"
    db = MagicMock()
    db.get_session = MagicMock(return_value={"id": "s1", "message_count": 0})
    session = {
        "agent": old_agent,
        "session_key": "s1",
        "running": False,
        "model_override": {"model": "gpt-x", "provider": "openai"},
    }
    events: list[tuple] = []
    server._get_db = MagicMock(return_value=db)
    server._find_live_session_by_key = MagicMock(return_value=("sid1", session))
    server._sessions = {"sid1": session}
    server._make_agent = MagicMock(return_value=new_agent)
    server._session_info = MagicMock(return_value={"agent_preset": "minimal"})
    server._session_source = MagicMock(return_value="tui")
    server._restart_slash_worker = MagicMock()
    server._emit = lambda event, sid, payload=None: events.append((event, sid, payload))
    server._sessions_lock = threading.Lock()

    out = _ok(_call(server, "preset.apply", {"session_id": "s1", "preset_id": "minimal"}))

    assert out["recomposed"] is True
    assert out["info"]["agent_preset"] == "minimal"
    # Recompose keeps the in-session model pick.
    server._make_agent.assert_called_once()
    kwargs = server._make_agent.call_args.kwargs
    assert kwargs["agent_preset"] == "minimal"
    assert kwargs["model_override"] == {"model": "gpt-x", "provider": "openai"}
    assert session["agent"] is new_agent
    assert events == [("session.info", "sid1", {"agent_preset": "minimal"})]
    db.set_session_agent_preset.assert_called_once_with("s1", "minimal")


def test_preset_apply_deferred_build_agent_noop(server):
    db = MagicMock()
    db.get_session = MagicMock(return_value={"id": "s1", "message_count": 0})
    session = {"agent": None, "session_key": "s1", "running": False}
    server._get_db = MagicMock(return_value=db)
    server._find_live_session_by_key = MagicMock(return_value=("sid1", session))
    out = _ok(_call(server, "preset.apply", {"session_id": "s1", "preset_id": "code"}))
    assert out == {"applied": True, "recomposed": False}


def test_stored_runtime_overrides_carry_preset(server):
    overrides = server._stored_session_runtime_overrides(
        {"agent_preset": "creative", "model": "gpt-x"}
    )
    assert overrides["agent_preset"] == "creative"


def test_stored_runtime_overrides_omit_missing_preset(server):
    overrides = server._stored_session_runtime_overrides({"model": "gpt-x"})
    assert "agent_preset" not in overrides


def test_make_agent_forwards_preset(server, monkeypatch):
    built: dict = {}
    fake_agent = MagicMock()

    def _fake_aiagent(**kwargs):
        built.update(kwargs)
        return fake_agent

    monkeypatch.setattr(server, "_load_cfg", MagicMock(return_value={}))
    monkeypatch.setattr(server, "_prompt_text", lambda s: s)
    monkeypatch.setattr(server, "_parse_tui_skills_env", lambda: None)
    monkeypatch.setattr(server, "_resolve_startup_runtime", lambda: ("m", None))
    monkeypatch.setattr(
        server,
        "_resolve_runtime_with_fallback",
        lambda kwargs: type("R", (), {"runtime": {}, "used_fallback": False})(),
    )
    monkeypatch.setattr(server, "_load_provider_routing", lambda: {})
    monkeypatch.setattr(server, "_cfg_max_turns", lambda cfg, d: d)
    monkeypatch.setattr(server, "_load_enabled_toolsets", lambda: None)
    monkeypatch.setattr(server, "_resolve_agent_platform", lambda p: p)
    monkeypatch.setattr(server, "_load_reasoning_config", lambda m: None)
    monkeypatch.setattr(server, "_load_service_tier", lambda: None)
    monkeypatch.setattr(server, "_load_fallback_model", lambda: None)
    monkeypatch.setattr(server, "_agent_cbs", lambda sid: {})
    monkeypatch.setattr(server, "_get_db", lambda: None)
    monkeypatch.setattr(server, "wait_for_mcp_discovery", lambda: None, raising=False)
    monkeypatch.setattr("run_agent.AIAgent", _fake_aiagent)

    server._make_agent("sid", "key", agent_preset="minimal")
    assert built["agent_preset"] == "minimal"