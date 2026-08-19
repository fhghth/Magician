"""Tests for the tools-rejection recovery in the API retry loop.

When an OpenAI-compatible server (Ollama especially) rejects a request
that carries a tools array for a model without function calling —
HTTP 400 "<model> does not support tools" — the agent must record the
verdict in the shared per-(model, base_url) cache that
``build_api_kwargs`` consults, then retry the turn without tools so
the session keeps working as plain chat.

These tests lock in the phrase detector and the cache-key contract
shared with ``agent.chat_completion_helpers._ollama_missing_tools_cached``.
"""

from types import SimpleNamespace

from agent.conversation_loop import _looks_like_tools_rejection
from agent.chat_completion_helpers import _ollama_missing_tools_cached


class TestLooksLikeToolsRejection:
    """The phrase detector must fire on real provider wordings only."""

    def test_matches_ollama_exact_wording(self):
        err = "HTTP 400: registry.ollama.ai/library/Furina:latest does not support tools"
        assert _looks_like_tools_rejection(err) is True

    def test_matches_other_common_phrasings(self):
        for msg in (
            "This model does not support tool calling",
            "tools are not supported for model llama3",
            "Error 400: model does not support function calling",
            "tool calling is not supported by this model",
        ):
            assert _looks_like_tools_rejection(msg) is True, msg

    def test_case_insensitive(self):
        assert _looks_like_tools_rejection("DOES NOT SUPPORT TOOLS") is True

    def test_does_not_match_unrelated_errors(self):
        for msg in (
            "HTTP 400: Unsupported parameter: temperature",
            "model does not support images",
            "context length exceeded",
            "rate limit exceeded",
            "",
            None,
        ):
            assert _looks_like_tools_rejection(msg) is False, msg


class TestToolsRejectionCacheContract:
    """The recovery verdict must land in the cache that build_api_kwargs reads.

    ``_ollama_missing_tools_cached`` keys on (str(model), str(base_url)) with
    a (supported, monotonic_ts) tuple. The retry loop writes the same shape,
    so the next turn skips tools without a probe round-trip.
    """

    def test_written_verdict_is_read_back_as_missing(self):
        agent = SimpleNamespace(
            tools=[{"type": "function", "function": {"name": "x"}}],
            model="Furina:latest",
            base_url="http://localhost:11434/v1",
        )
        agent._ollama_tools_cache = {}
        key = (agent.model, agent.base_url)
        # Simulate the retry loop recording the 400 verdict.
        import time as _time
        agent._ollama_tools_cache[key] = (False, _time.monotonic())
        assert _ollama_missing_tools_cached(agent) is True

    def test_support_verdict_keeps_tools(self):
        agent = SimpleNamespace(
            tools=[{"type": "function", "function": {"name": "x"}}],
            model="qwen3:8b",
            base_url="http://localhost:11434/v1",
        )
        agent._ollama_tools_cache = {}
        import time as _time
        agent._ollama_tools_cache[(agent.model, agent.base_url)] = (True, _time.monotonic())
        assert _ollama_missing_tools_cached(agent) is False
