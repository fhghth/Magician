"""Meeting seat model ladder: config-default resolution (settings page editor).

Covers the M1.6 model-default contract:
* a live session override (dict or legacy string) wins over the config block;
* an empty session override falls through to ``meeting.model`` config, with
  provider only attached when the config block names one;
* a missing/empty config block degrades to ``(None, None)`` so the runtime's
  global model resolution applies unchanged.
"""

from __future__ import annotations

from tui_gateway.methods_meeting import _resolve_meeting_model_override


def test_session_override_wins_unchanged():
    override, provider = _resolve_meeting_model_override(
        {"model": "gemini-2.5-pro", "provider": "gemini"}, {"default": "other", "provider": "openrouter"}
    )
    assert override == {"model": "gemini-2.5-pro", "provider": "gemini"}
    assert provider == "gemini"


def test_legacy_string_override_passes_through():
    override, provider = _resolve_meeting_model_override("grok-4", {"default": "other"})
    assert override == "grok-4"
    assert provider is None


def test_empty_session_falls_to_meeting_config():
    override, provider = _resolve_meeting_model_override(None, {"default": "kimi-k2", "provider": "kimi"})
    assert override == {"model": "kimi-k2", "provider": "kimi"}
    assert provider == "kimi"


def test_meeting_config_without_provider_leaves_runtime_resolution():
    override, provider = _resolve_meeting_model_override({}, {"default": "gpt-5.2"})
    assert override == {"model": "gpt-5.2"}
    assert provider is None


def test_empty_meeting_config_degrades_to_global():
    assert _resolve_meeting_model_override(None, {"default": "", "provider": ""}) == (None, None)
    assert _resolve_meeting_model_override(None, None) == (None, None)
    assert _resolve_meeting_model_override(None, {}) == (None, None)