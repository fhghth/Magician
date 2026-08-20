"""``config.set key=agent_presets.default`` — the desktop draft/new-chat surface.

The desktop's agent-mode pill has two targets: a live session (``preset.apply``,
session-scoped) and a brand-new chat with no session yet (a draft). The draft
target pins the preset brand-new sessions start on by writing
``agent_presets.default`` to config.yaml — no session involved. This test pins
the RPC contract for that branch.

Contract under test:

1. ``config.set key=agent_presets.default`` (no session) writes the dotpath key
   and echoes the value back.
2. An empty value clears the default (back to the backend's built-in fallback).
"""

from __future__ import annotations

import importlib

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def server():
    # Same import isolation as test_presets_rpc.py: a bare `import
    # tui_gateway.server` would pull in the real hermes_constants /
    # hermes_cli.env_loader / hermes_state and poison the shared module for
    # later files (cross-file mock-import pollution). Patch the same four
    # module keys so this file is hermetic.
    with patch.dict(
        "sys.modules",
        {
            "hermes_constants": MagicMock(
                get_hermes_home=MagicMock(return_value="/tmp/hermes_test_preset_default")
            ),
            "hermes_cli.env_loader": MagicMock(),
            "hermes_cli.banner": MagicMock(),
            "hermes_state": MagicMock(),
        },
    ):
        mod = importlib.import_module("tui_gateway.server")
    yield mod


def _set(server, params: dict) -> dict:
    return server._methods["config.set"]("rid-1", params)


class TestConfigSetPresetDefault:
    def test_sets_default_preset(self, server) -> None:
        with patch.object(server, "_write_config_key") as write_key:
            resp = _set(server, {"key": "agent_presets.default", "value": "minimal"})
        assert resp["result"] == {"key": "agent_presets.default", "value": "minimal"}
        write_key.assert_called_once_with("agent_presets.default", "minimal")

    def test_empty_value_clears_default(self, server) -> None:
        with patch.object(server, "_write_config_key") as write_key:
            resp = _set(server, {"key": "agent_presets.default", "value": ""})
        assert resp["result"] == {"key": "agent_presets.default", "value": ""}
        write_key.assert_called_once_with("agent_presets.default", "")

    def test_unknown_key_still_rejected(self, server) -> None:
        with patch.object(server, "_write_config_key") as write_key:
            resp = _set(server, {"key": "agent_presets.made_up", "value": "x"})
        assert resp["error"]["code"] == 4002
        write_key.assert_not_called()
