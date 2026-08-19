"""``hermes preset`` — manage agent presets (persona + tool profiles).

Aligned with deepseek-harness's agent-presets package: presets are
directories with an ``agent.preset.yaml`` composition file plus an optional
``preset.yml`` metadata file. Built-ins ship in the repo; user presets live in
``~/.hermes/.agent-presets/<id>/`` (bundled ids win on collision).

Verbs:

* ``list``            — show every preset, marking the session default.
* ``show <id>``       — print a preset's persona / tools / capabilities.
* ``copy <src> <new>``— duplicate a preset into the user root under a new id.
* ``default [id]``    — print or set the global default preset ("" clears).

Mid-session switching happens in the interactive CLI via ``/preset``, which
recomposes the running agent immediately (harness recompose semantics).
"""

from __future__ import annotations

import argparse
import json
import sys


def _cmd_list(args: argparse.Namespace) -> int:
    from hermes_cli.agent_presets import discover_presets
    from hermes_cli.config import load_config

    presets = discover_presets()
    default = str((load_config().get("agent_presets", {}) or {}).get("default", "") or "")
    if not presets:
        print("No agent presets found.")
        return 0
    for preset in presets:
        trust = "built-in" if preset.trust == "system" else "user"
        if preset.broken:
            print(f"✗ [{trust}] {preset.id} — broken: {preset.broken_reason}")
            continue
        name_part = f" — {preset.name}" if preset.name and preset.name != preset.id else ""
        desc_part = f": {preset.description}" if preset.description else ""
        default_mark = " (default)" if preset.id == default else ""
        print(f"  [{trust}] {preset.id}{name_part}{default_mark}")
        if desc_part:
            print(f"          {desc_part}")
        summary = preset.toolset_summary()
        print(f"          tools: {summary}")
        for problem in preset.problems:
            print(f"          ⚠ {problem}")
    return 0


def _cmd_show(args: argparse.Namespace) -> int:
    from hermes_cli.agent_presets import load_preset

    try:
        preset = load_preset(args.preset_id)
    except ValueError as exc:
        print(f"✗ {exc}")
        return 1
    print(f"preset: {preset.id} ({preset.trust})")
    print(f"  path: {preset.path}")
    if preset.name and preset.name != preset.id:
        print(f"  name: {preset.name}")
    if preset.description:
        print(f"  description: {preset.description}")
    persona = preset.persona
    if persona:
        print(f"  persona: complete={persona.get('complete', False)} "
              f"include_runtime_context={persona.get('include_runtime_context', False)}")
        print(persona.get("text", "").strip())
    summary = preset.toolset_summary()
    print(f"  tools: {summary}")
    for row in preset.tools or []:
        flag = "disabled" if row.get("disabled") else "enabled"
        print(f"    - {row.get('toolset')} ({flag})")
    for key, value in (preset.capabilities or {}).items():
        print(f"    capability {key}: {value}")
    for problem in preset.problems:
        print(f"  ⚠ {problem}")
    return 0


def _cmd_copy(args: argparse.Namespace) -> int:
    from hermes_cli.agent_presets import copy_preset

    try:
        dest = copy_preset(args.src_id, args.new_id)
    except ValueError as exc:
        print(f"✗ {exc}")
        return 1
    print(f"✓ Copied preset {args.src_id} → {args.new_id}")
    print(f"  {dest}")
    print(f"  Activate with `hermes preset default {args.new_id}` or /preset {args.new_id}.")
    return 0


def _cmd_default(args: argparse.Namespace) -> int:
    from hermes_cli.agent_presets import find_preset
    from hermes_cli.config import load_config

    if not args.preset_id:
        current = str((load_config().get("agent_presets", {}) or {}).get("default", "") or "")
        print(current or "(no default preset)")
        return 0
    target = args.preset_id
    if target != "" and find_preset(target) is None:
        print(f"✗ Unknown preset: {target}")
        return 1
    try:
        from cli import save_config_value

        save_config_value("agent_presets.default", target)
    except Exception as exc:
        print(f"✗ Could not persist default preset: {exc}")
        return 1
    print(f"✓ Default preset: {target or '(none)'}")
    return 0


def register_cli(parent: argparse.ArgumentParser) -> None:
    parent.set_defaults(func=_cmd_list)  # bare `hermes preset` → list
    sub = parent.add_subparsers(dest="preset_action")

    p_list = sub.add_parser("list", help="List all agent presets")
    p_list.set_defaults(func=_cmd_list)

    p_show = sub.add_parser("show", help="Show a preset's persona, tools, and capabilities")
    p_show.add_argument("preset_id", help="Preset id (directory name)")
    p_show.set_defaults(func=_cmd_show)

    p_copy = sub.add_parser("copy", help="Copy a preset into ~/.hermes/.agent-presets/")
    p_copy.add_argument("src_id", help="Source preset id")
    p_copy.add_argument("new_id", help="New preset id (must match ^[a-z0-9][a-z0-9-]*$)")
    p_copy.set_defaults(func=_cmd_copy)

    p_default = sub.add_parser(
        "default", help="Print or set the global default preset ('' clears)"
    )
    p_default.add_argument(
        "preset_id", nargs="?", default=None,
        help="Preset id to use for new sessions, or '' to clear (omit to print)",
    )
    p_default.set_defaults(func=_cmd_default)


def cmd_preset(args: argparse.Namespace) -> int:
    """Entry point for the console engine / tests (mirrors ``hermes preset``)."""
    func = getattr(args, "func", None) or _cmd_list
    return func(args) if func else 0


if __name__ == "__main__":
    _p = argparse.ArgumentParser(prog="hermes preset")
    register_cli(_p)
    sys.exit(_p.parse_args().func(_p.parse_args()))