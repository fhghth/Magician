"""Tests for agent presets (hermes_cli/agent_presets.py + hermes_cli/presets.py).

Behavior contracts (aligned with deepseek-harness agent-presets):
* discovery is first-root-wins, bundled root first — a user preset never
  shadows a bundled one with the same id;
* a broken preset is still listed (not hidden), it just cannot be mounted;
* preset ids must match ^[a-z0-9][a-z0-9-]*$;
* copy refuses an existing id and an invalid new id.
"""

import os

import pytest

from hermes_cli.agent_presets import (
    BUNDLED_PRESET_DIR,
    COMPOSITION_FILE,
    PRESET_ID_RE,
    AgentPreset,
    apply_preset_tools,
    copy_preset,
    discover_presets,
    find_preset,
    load_preset,
    user_presets_root,
)


def _write_user_preset(home, preset_id, composition_lines, meta=None):
    d = home / ".agent-presets" / preset_id
    d.mkdir(parents=True, exist_ok=True)
    (d / COMPOSITION_FILE).write_text(composition_lines, encoding="utf-8")
    if meta is not None:
        (d / "preset.yml").write_text(meta, encoding="utf-8")
    return d


class TestDiscovery:
    def test_bundled_presets_are_discovered(self):
        presets = discover_presets(include_user_root=False)
        ids = {p.id for p in presets}
        assert {"minimal", "standard", "code", "creative"} <= ids

    def test_bundled_preset_paths_point_at_bundled_root(self):
        for preset in discover_presets(include_user_root=False):
            assert BUNDLED_PRESET_DIR in preset.path.parents

    def test_user_preset_is_discovered(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(tmp_path, "my-preset", "- kind: persona\n  config:\n    text: hi\n")
        presets = discover_presets()
        by_id = {p.id: p for p in presets}
        assert by_id["my-preset"].trust == "user"

    def test_bundled_wins_over_user_same_id(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(tmp_path, "minimal", "- kind: persona\n  config:\n    text: shadow\n")
        preset = find_preset("minimal")
        assert preset is not None
        assert preset.trust == "system"
        assert "minimal mode" in (preset.persona or {}).get("text", "")

    def test_metadata_is_read(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "my-preset",
            "- kind: persona\n  config:\n    text: hi\n",
            meta="name: My Preset\ndescription: Does things\norder: 5\n",
        )
        preset = find_preset("my-preset")
        assert preset.name == "My Preset"
        assert preset.description == "Does things"
        assert preset.order == 5

    def test_broken_composition_is_listed_not_hidden(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(tmp_path, "broken-one", "not: a: list:\n- malformed")
        presets = discover_presets()
        broken = [p for p in presets if p.id == "broken-one"]
        assert len(broken) == 1
        assert broken[0].broken
        with pytest.raises(ValueError):
            load_preset("broken-one")

    def test_missing_composition_is_broken(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        d = tmp_path / ".agent-presets" / "empty-one"
        d.mkdir(parents=True)
        (d / "preset.yml").write_text("name: Empty\n", encoding="utf-8")
        presets = discover_presets()
        broken = [p for p in presets if p.id == "empty-one"]
        assert len(broken) == 1
        assert broken[0].broken

    def test_invalid_id_directories_are_skipped(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(tmp_path, "UPPER-CASE", "- kind: persona\n  config:\n    text: hi\n")
        _write_user_preset(tmp_path, "bad id", "- kind: persona\n  config:\n    text: hi\n")
        assert find_preset("UPPER-CASE") is None
        assert find_preset("bad id") is None


class TestCompositionParsing:
    def test_persona_complete_flags(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "p1",
            "- kind: persona\n"
            "  config:\n"
            "    text: You are X.\n"
            "    complete: true\n"
            "    include_runtime_context: true\n",
        )
        persona = find_preset("p1").persona
        assert persona["complete"] is True
        assert persona["include_runtime_context"] is True
        assert persona["text"].strip() == "You are X."

    def test_tools_rows_and_capabilities(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "p2",
            "- kind: tools\n"
            "  config:\n"
            "    - toolset: file\n"
            "    - toolset: terminal\n"
            "      disabled: true\n"
            "- kind: capabilities\n"
            "  config:\n"
            "    delegation: false\n"
            "    memory: true\n",
        )
        preset = find_preset("p2")
        assert [r["toolset"] for r in preset.tools] == ["file", "terminal"]
        assert preset.tools[1]["disabled"] is True
        assert preset.capabilities == {"delegation": False, "memory": True}

    def test_unknown_kind_is_a_problem_not_a_crash(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "p3",
            "- kind: mystery\n  config: {}\n",
        )
        preset = find_preset("p3")
        assert preset.broken is False
        assert any("mystery" in p for p in preset.problems)

    def test_unknown_capability_is_a_problem(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "p4",
            "- kind: capabilities\n  config:\n    warp_drive: false\n",
        )
        preset = find_preset("p4")
        assert any("warp_drive" in p for p in preset.problems)

    def test_standard_is_empty(self):
        preset = load_preset("standard")
        assert preset.is_empty
        assert preset.persona is None
        assert preset.tools is None
        assert preset.capabilities is None

    def test_minimal_shape(self):
        preset = load_preset("minimal")
        assert preset.persona["complete"] is True
        toolset_names = [r["toolset"] for r in preset.tools]
        assert set(toolset_names) == {"file", "terminal", "todo"}

    def test_load_unknown_raises(self):
        with pytest.raises(ValueError):
            load_preset("does-not-exist")


class TestApplyPresetTools:
    def test_minimal_merges_enabled(self):
        preset = load_preset("minimal")
        enabled, disabled = apply_preset_tools(preset, [], [])
        assert "file" in enabled
        assert "terminal" in enabled
        assert "todo" in enabled

    def test_capability_false_excludes(self):
        preset = load_preset("code")
        enabled, disabled = apply_preset_tools(preset, ["all"], [])
        assert "image_gen" in disabled
        assert "vision" in disabled
        assert "spotify" in disabled

    def test_existing_disabled_is_preserved(self):
        preset = load_preset("code")
        enabled, disabled = apply_preset_tools(preset, ["all"], ["search"])
        assert "search" in disabled
        assert "image_gen" in disabled

    def test_all_enabled_keeps_ensure_rows_idempotent(self):
        preset = load_preset("minimal")
        enabled, _ = apply_preset_tools(preset, ["all"], [])
        assert enabled == ["all"]

    def test_disabled_tools_row(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        _write_user_preset(
            tmp_path,
            "p5",
            "- kind: tools\n  config:\n    - toolset: browser\n      disabled: true\n",
        )
        preset = find_preset("p5")
        _, disabled = apply_preset_tools(preset, [], [])
        assert "browser" in disabled


class TestCopy:
    def test_copy_to_user_root(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        dest = copy_preset("minimal", "my-minimal")
        assert dest == user_presets_root() / "my-minimal"
        assert (dest / COMPOSITION_FILE).is_file()
        assert (dest / "preset.yml").is_file()
        assert find_preset("my-minimal").trust == "user"

    def test_copy_refuses_existing_id(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        with pytest.raises(ValueError):
            copy_preset("minimal", "minimal")

    def test_copy_refuses_invalid_id(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        with pytest.raises(ValueError):
            copy_preset("minimal", "Bad ID")
        with pytest.raises(ValueError):
            copy_preset("minimal", "UPPER")

    def test_copy_unknown_source(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        with pytest.raises(ValueError):
            copy_preset("nope", "new-one")

    def test_preset_id_regex(self):
        assert PRESET_ID_RE.match("minimal")
        assert PRESET_ID_RE.match("my-custom-1")
        assert not PRESET_ID_RE.match("UPPER")
        assert not PRESET_ID_RE.match("-leading")
        assert not PRESET_ID_RE.match("has space")


class TestPresetsCli:
    def test_list_command(self, capsys, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        from hermes_cli.presets import _cmd_list
        import argparse

        assert _cmd_list(argparse.Namespace()) == 0
        out = capsys.readouterr().out
        assert "minimal" in out
        assert "standard" in out

    def test_default_command_sets_and_reads(self, capsys, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        from hermes_cli.presets import _cmd_default
        from hermes_cli.config import load_config
        import argparse

        assert _cmd_default(argparse.Namespace(preset_id="minimal")) == 0
        assert load_config()["agent_presets"]["default"] == "minimal"
        capsys.readouterr()
        assert _cmd_default(argparse.Namespace(preset_id=None)) == 0
        assert "minimal" in capsys.readouterr().out

    def test_default_unknown_id_rejected(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        from hermes_cli.presets import _cmd_default
        import argparse

        assert _cmd_default(argparse.Namespace(preset_id="nope")) == 1

    def test_show_command(self, capsys, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        from hermes_cli.presets import _cmd_show
        import argparse

        assert _cmd_show(argparse.Namespace(preset_id="minimal")) == 0
        out = capsys.readouterr().out
        assert "persona" in out
        assert "file" in out


class TestUserPresetsRoot:
    def test_home_anchored(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        assert user_presets_root() == tmp_path / ".agent-presets"