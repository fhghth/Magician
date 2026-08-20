"""Integration tests: agent preset mounting onto a real AIAgent.

Contracts:
* ``agent_preset=`` param → persona + tools applied (complete persona replaces
  the whole system prompt; tools merge into the enabled toolset list);
* config ``agent_presets.default`` applies when no param is given;
* a session row's ``agent_preset`` column wins over the config default;
* append (complete: false) persona rides at the end of the system prompt.
"""

import pytest

from run_agent import AIAgent


def _make_agent(**overrides):
    kwargs = dict(
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
        model="test/model",
        quiet_mode=True,
        skip_context_files=True,
        skip_memory=True,
    )
    kwargs.update(overrides)
    return AIAgent(**kwargs)


class TestPresetParam:
    def test_minimal_preset_applies_persona_and_tools(self):
        agent = _make_agent(agent_preset="minimal")
        assert agent._agent_preset is not None
        assert agent._agent_preset.id == "minimal"
        assert agent._preset_persona is not None
        assert agent._preset_persona.get("complete") is True
        assert agent._agent_preset_id == "minimal"
        # Complete persona → system prompt is the preset text (plus runtime
        # context hints, since minimal opts in), not the Hermes scaffold.
        prompt = agent._cached_system_prompt or agent._build_system_prompt()
        assert "minimal mode" in prompt
        assert "Hermes" in prompt or "environment" in prompt.lower()

    def test_minimal_tools_are_restricted(self):
        agent = _make_agent(agent_preset="minimal")
        names = {t["function"]["name"] for t in agent.tools}
        assert names  # tools loaded
        assert any("write_file" in n for n in names) or "file" in {
            _toolset_for(agent, n) for n in names
        }
        # Browser/search tools must not be present in minimal mode.
        assert not any(n.startswith("browser_") for n in names)
        assert "web_search" not in names

    def test_minimal_turns_skills_off(self):
        agent = _make_agent(agent_preset="minimal")
        assert agent._preset_skill_allow == []
        # The empty allow-list removes the skills index from the system prompt.
        prompt = agent._cached_system_prompt or agent._build_system_prompt()
        assert "available_skills" not in prompt
        assert "<available_skills>" not in prompt

    def test_code_preset_restricts_skills_to_development_set(self):
        agent = _make_agent(agent_preset="code")
        assert agent._preset_skill_allow == [
            "test-driven-development",
            "systematic-debugging",
            "requesting-code-review",
            "simplify-code",
            "codebase-inspection",
            "github-pr-workflow",
        ]
        assert agent._preset_skill_deny == ()

    def test_no_preset_leaves_skills_untouched(self):
        agent = _make_agent()
        assert agent._preset_skill_allow is None
        assert agent._preset_skill_deny == ()

    def test_unknown_preset_falls_back_gracefully(self):
        agent = _make_agent(agent_preset="nope-preset")
        assert agent._agent_preset is None
        assert agent._agent_preset_id is None
        assert agent._preset_persona is None
        assert agent.tools  # default tools still loaded

    def test_append_persona_rides_at_prompt_end(self):
        agent = _make_agent(agent_preset="code")
        prompt = agent._cached_system_prompt or agent._build_system_prompt()
        assert "code mode" in prompt
        # Hermes scaffold is preserved for append presets.
        assert "You are Hermes" in prompt or "Hermes" in prompt

    def test_no_preset_is_unchanged(self):
        agent = _make_agent()
        assert agent._agent_preset is None
        assert agent._preset_persona is None
        prompt = agent._cached_system_prompt or agent._build_system_prompt()
        assert "minimal mode" not in prompt


class TestPresetResolution:
    def _write_config(self, text):
        from hermes_constants import get_hermes_home

        (get_hermes_home() / "config.yaml").write_text(text, encoding="utf-8")

    def test_config_default_applies(self):
        self._write_config("agent_presets:\n  default: minimal\n")
        agent = _make_agent()
        assert agent._agent_preset_id == "minimal"
        assert agent._preset_persona is not None

    def test_explicit_param_wins_over_config(self):
        self._write_config("agent_presets:\n  default: minimal\n")
        agent = _make_agent(agent_preset="code")
        assert agent._agent_preset_id == "code"

    def test_session_record_wins_over_config(self):
        from hermes_state import SessionDB

        self._write_config("agent_presets:\n  default: code\n")
        db = SessionDB()
        db.create_session(
            session_id="sess-preset-1",
            source="cli",
            agent_preset="minimal",
        )
        agent = _make_agent(session_id="sess-preset-1", session_db=db)
        assert agent._agent_preset_id == "minimal"

    def test_session_persisted_on_create(self, tmp_path, monkeypatch):
        from hermes_state import SessionDB

        db = SessionDB()
        agent = _make_agent(agent_preset="minimal", session_id="sess-preset-2", session_db=db)
        agent._ensure_db_session()
        row = db.get_session("sess-preset-2")
        assert row is not None
        assert row["agent_preset"] == "minimal"


def _toolset_for(agent, tool_name):
    return getattr(agent, "get_toolset_for_tool", lambda n: "")(tool_name)