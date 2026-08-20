"""Agent Presets — persona + tool/capability profiles for an agent session.

Modeled on deepseek-harness's ``agent-presets`` package (``discovery.ts``,
``preset.ts``, ``metadata.ts``, ``mount.ts``, ``authoring.ts``):

* A preset is a directory containing a composition file (``agent.preset.yaml``)
  plus an optional metadata file (``preset.yml``).
* The composition file is a top-level *list* of lines — YAML cannot attach
  sibling keys to a list, so display metadata lives in ``preset.yml``.
* Built-in presets ship under ``hermes_cli/agent_presets/``; user presets live
  under ``<HERMES_HOME>/.agent-presets/<id>/`` (the harness uses the same
  ``.agent-presets`` directory name for user presets).
* Discovery is first-root-wins with the bundled root scanned first, so a user
  preset can never shadow a bundled one with the same id (same as harness:
  system root precedes user roots, ``includeUserRoot`` appends after).
* A broken preset (missing/unparseable composition) is still *listed* so the
  user can see it and fix it — it just cannot be mounted.

Line kinds:

* ``persona``      — system-prompt text. ``complete: true`` replaces the whole
  system prompt; ``complete: false`` appends to the end of it.
  ``include_runtime_context: true`` appends environment hints after the text.
* ``tools``        — list of ``{toolset: <name>, disabled: true|false}`` rows.
  Rows without ``disabled`` enable the toolset; ``disabled: true`` excludes it.
* ``capabilities`` — map of capability key — bool. ``false`` excludes the
  mapped toolset, ``true`` ensures it is enabled.
* ``skills``       — list of skill names. A bare name is an allow-list entry
  (only those skills appear in the system-prompt index); a ``~name`` entry
  denies that skill (everything else stays). ``[]`` turns skills off entirely.
  Absent line = leave the default (all skills).
"""

from __future__ import annotations

import logging
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml

from hermes_constants import get_hermes_home, display_hermes_home

logger = logging.getLogger(__name__)

# ── Filenames / directories (aligned with harness agent-presets) ────────────
COMPOSITION_FILE = "agent.preset.yaml"
METADATA_FILE = "preset.yml"
USER_PRESET_DIR = ".agent-presets"

# Harness: PRESET_ID = /^[a-z0-9][a-z0-9-]*$/ — directory name is the preset id.
PRESET_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# Bundled presets ship in this directory (first discovery root, wins on
# name collisions — harness scans system roots before user roots).
BUNDLED_PRESET_DIR = Path(__file__).resolve().parent / "agent_presets"

# ── Line kinds ──────────────────────────────────────────────────────────────
PERSONA_KIND = "persona"
TOOLS_KIND = "tools"
CAPABILITIES_KIND = "capabilities"
SKILLS_KIND = "skills"
KNOWN_KINDS = frozenset({PERSONA_KIND, TOOLS_KIND, CAPABILITIES_KIND, SKILLS_KIND})

# Capability key → Hermes toolset name.
_CAPABILITY_TOOLSETS = {
    "skills": "skills",
    "delegation": "delegation",
    "memory": "memory",
    "clarify": "clarify",
    "session_search": "session_search",
    "browser": "browser",
    "web": "web",
    "search": "search",
    "image_gen": "image_gen",
    "vision": "vision",
    "tts": "tts",
    "video": "video",
    "spotify": "spotify",
    "todo": "todo",
    "cronjob": "cronjob",
    "terminal": "terminal",
    "file": "file",
}


@dataclass
class AgentPreset:
    """A discovered agent preset.

    ``broken`` presets are listed but cannot be mounted; ``problems`` holds
    human-readable validation notes surfaced by ``hermes preset list``.
    """

    id: str
    trust: str  # "system" | "user"
    path: Path
    name: str = ""
    description: str = ""
    order: int = 1000
    broken: bool = False
    broken_reason: str = ""
    composition: Optional[list] = None
    problems: List[str] = field(default_factory=list)

    # ── Convenience accessors over the parsed composition ──────────────────
    @property
    def persona(self) -> Optional[dict]:
        for line in self.composition or []:
            if line.get("kind") == PERSONA_KIND:
                cfg = line.get("config") or {}
                if isinstance(cfg, dict):
                    return cfg
        return None

    @property
    def tools(self) -> Optional[list]:
        for line in self.composition or []:
            if line.get("kind") == TOOLS_KIND:
                cfg = line.get("config")
                if isinstance(cfg, list):
                    return cfg
        return None

    @property
    def capabilities(self) -> Optional[dict]:
        for line in self.composition or []:
            if line.get("kind") == CAPABILITIES_KIND:
                cfg = line.get("config")
                if isinstance(cfg, dict):
                    return cfg
        return None

    @property
    def skills(self) -> Optional[list]:
        """Raw skills line: list of names; ``~name`` entries deny."""
        for line in self.composition or []:
            if line.get("kind") == SKILLS_KIND:
                cfg = line.get("config")
                if isinstance(cfg, list):
                    return cfg
        return None

    @property
    def is_empty(self) -> bool:
        """True when the preset changes nothing (e.g. ``standard``)."""
        return not (self.persona or self.tools or self.capabilities or self.skills)

    def toolset_summary(self) -> str:
        """Compact human-readable tool/capability summary for listing."""
        parts = []
        for row in self.tools or []:
            name = row.get("toolset")
            if not name:
                continue
            parts.append(f"~{name}" if row.get("disabled") else name)
        for key, value in (self.capabilities or {}).items():
            ts = _CAPABILITY_TOOLSETS.get(key)
            if ts and not value and ts not in parts:
                parts.append(f"~{ts}")
        return ", ".join(parts) if parts else "(default tools)"

    def skills_summary(self) -> str:
        """Compact human-readable skills line for listing.

        ``"(default skills)"`` — no skills line: the default set stays.
        ``"(no skills)"`` — empty allow-list: skills are off.
        Otherwise the allow list with ``~name`` for denied entries.
        """
        skills = self.skills
        if skills is None:
            return "(default skills)"
        parts = []
        for name in skills:
            if not isinstance(name, str) or not name.strip():
                continue
            entry = name.strip()
            parts.append(entry if not entry.startswith("~") else f"~{entry[1:]}")
        return ", ".join(parts) if parts else "(no skills)"


def user_presets_root() -> Path:
    """User preset root: ``<HERMES_HOME>/.agent-presets``."""
    return get_hermes_home() / USER_PRESET_DIR


def _read_preset_metadata(preset_dir: Path) -> Tuple[str, str, int]:
    """Read ``preset.yml`` (name/description/order). Failures degrade to
    defaults — the preset stays mountable (harness ``readPresetMetadata``
    behavior: metadata problems do not hide the preset)."""
    name = description = ""
    order = 1000
    meta_path = preset_dir / METADATA_FILE
    if not meta_path.is_file():
        return name, description, order
    try:
        data = yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            return name, description, order
        name = str(data.get("name", "") or "")
        description = str(data.get("description", "") or "")
        try:
            order = int(data.get("order", 1000))
        except (TypeError, ValueError):
            order = 1000
    except Exception as exc:  # metadata corruption must not hide the preset
        logger.warning("agent preset %s: bad %s: %s", preset_dir.name, METADATA_FILE, exc)
    return name, description, order


def _parse_composition(path: Path) -> Tuple[Optional[list], List[str]]:
    """Parse + validate a composition file. Returns (lines, problems).

    ``lines`` is None when the file is missing or unparseable (broken preset).
    """
    if not path.is_file():
        return None, []
    problems: List[str] = []
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, [f"cannot parse {path.name}: {exc}"]
    if raw is None:
        return [], []
    if not isinstance(raw, list):
        return None, [f"{path.name} must be a top-level list of lines"]
    lines = []
    for idx, entry in enumerate(raw):
        if not isinstance(entry, dict):
            problems.append(f"line {idx + 1}: expected a mapping with kind + config")
            continue
        kind = entry.get("kind")
        if kind not in KNOWN_KINDS:
            problems.append(
                f"line {idx + 1}: unknown kind {kind!r} "
                f"(known: {', '.join(sorted(KNOWN_KINDS))})"
            )
            continue
        cfg = entry.get("config")
        if kind == PERSONA_KIND:
            if not isinstance(cfg, dict) or not isinstance(cfg.get("text", ""), str) or not cfg.get("text", "").strip():
                problems.append("persona line needs config.text (non-empty string)")
            elif not isinstance(cfg.get("complete", False), bool) or not isinstance(cfg.get("include_runtime_context", False), bool):
                problems.append("persona config.complete/include_runtime_context must be booleans")
        elif kind == TOOLS_KIND:
            if not isinstance(cfg, list):
                problems.append("tools line needs config as a list of {toolset, disabled}")
            else:
                for tool_row in cfg:
                    if not isinstance(tool_row, dict) or not isinstance(tool_row.get("toolset", ""), str) or not tool_row.get("toolset", "").strip():
                        problems.append(f"tools row {tool_row!r} needs a non-empty toolset name")
        elif kind == CAPABILITIES_KIND:
            if not isinstance(cfg, dict):
                problems.append("capabilities line needs config as a mapping")
            else:
                for key, value in cfg.items():
                    if not isinstance(value, bool):
                        problems.append(f"capability {key!r} must be a boolean")
                    elif key not in _CAPABILITY_TOOLSETS:
                        problems.append(
                            f"capability {key!r} unknown "
                            f"(known: {', '.join(sorted(_CAPABILITY_TOOLSETS))})"
                        )
        elif kind == SKILLS_KIND:
            if not isinstance(cfg, list):
                problems.append("skills line needs config as a list of skill names")
            else:
                for skill_row in cfg:
                    if not isinstance(skill_row, str) or not skill_row.strip():
                        problems.append(f"skills entry {skill_row!r} must be a non-empty name")
        lines.append({"id": entry.get("id") or kind, "kind": kind, "config": cfg})
    return lines, problems


def scan_root(root: Path, trust: str) -> List[AgentPreset]:
    """Scan one preset root directory (harness ``scanPresetRoot``)."""
    if not root.is_dir():
        return []
    presets: List[AgentPreset] = []
    for entry in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_dir():
            continue
        preset_id = entry.name
        if not PRESET_ID_RE.match(preset_id):
            continue
        name, description, order = _read_preset_metadata(entry)
        composition_path = entry / COMPOSITION_FILE
        if not composition_path.is_file():
            presets.append(
                AgentPreset(
                    id=preset_id,
                    trust=trust,
                    path=entry,
                    name=name or preset_id,
                    description=description,
                    order=order,
                    broken=True,
                    broken_reason=f"missing {COMPOSITION_FILE}",
                )
            )
            continue
        composition, problems = _parse_composition(composition_path)
        if composition is None:
            presets.append(
                AgentPreset(
                    id=preset_id,
                    trust=trust,
                    path=entry,
                    name=name or preset_id,
                    description=description,
                    order=order,
                    broken=True,
                    broken_reason=problems[0] if problems else "unparseable composition",
                    problems=problems,
                )
            )
            continue
        presets.append(
            AgentPreset(
                id=preset_id,
                trust=trust,
                path=entry,
                name=name or preset_id,
                description=description,
                order=order,
                composition=composition,
                problems=problems,
            )
        )
    return presets


def discover_presets(*, include_user_root: bool = True) -> List[AgentPreset]:
    """Discover all presets: bundled root first, then the user root.

    First-root-wins on id collisions — a user preset can never shadow a
    bundled one (harness ``discoverPresets`` with ``includeUserRoot``).
    """
    by_id: Dict[str, AgentPreset] = {}
    for root, trust in ((BUNDLED_PRESET_DIR, "system"),):
        for preset in scan_root(root, trust):
            by_id.setdefault(preset.id, preset)
    if include_user_root:
        for preset in scan_root(user_presets_root(), "user"):
            by_id.setdefault(preset.id, preset)
    return sorted(by_id.values(), key=lambda p: (p.order, p.id))


def find_preset(preset_id: str) -> Optional[AgentPreset]:
    """Look up a preset by id (same resolution order as discovery)."""
    if not preset_id or not PRESET_ID_RE.match(preset_id):
        return None
    for preset in discover_presets():
        if preset.id == preset_id:
            return preset
    return None


def load_preset(preset_id: str) -> AgentPreset:
    """Load a preset or raise ValueError with a helpful listing."""
    preset = find_preset(preset_id)
    if preset is None:
        available = ", ".join(p.id for p in discover_presets()) or "(none)"
        raise ValueError(
            f"unknown agent preset {preset_id!r} — available: {available}"
        )
    if preset.broken:
        raise ValueError(
            f"agent preset {preset_id!r} is broken ({preset.broken_reason})"
        )
    return preset


def copy_preset(preset_id: str, new_id: str) -> Path:
    """Copy a preset to the user root under a new id (harness ``copyPreset``).

    Refuses a colliding id and validates the new id against PRESET_ID.
    """
    if not PRESET_ID_RE.match(new_id):
        raise ValueError(
            f"preset id {new_id!r} invalid — must match {PRESET_ID_RE.pattern}"
        )
    preset = find_preset(preset_id)
    if preset is None:
        raise ValueError(f"unknown agent preset {preset_id!r}")
    if find_preset(new_id) is not None:
        raise ValueError(
            f"agent preset {new_id!r} already exists — pick a different id"
        )
    dest = user_presets_root() / new_id
    if dest.exists():
        raise ValueError(
            f"agent preset {new_id!r} already exists in {display_hermes_home()}/.agent-presets"
        )
    dest.mkdir(parents=True, exist_ok=True)
    copied = False
    for fname in (COMPOSITION_FILE, METADATA_FILE):
        src = preset.path / fname
        if src.is_file():
            shutil.copy2(src, dest / fname)
            copied = True
    if not copied:
        raise ValueError(f"preset {preset_id!r} has nothing to copy")
    logger.info("copied agent preset %s → %s", preset_id, new_id)
    return dest


def apply_preset_tools(
    preset: AgentPreset,
    enabled_toolsets: Optional[List[str]] = None,
    disabled_toolsets: Optional[List[str]] = None,
) -> Tuple[List[str], List[str]]:
    """Merge a preset's tools rows + capabilities into toolset lists.

    Capability ``false`` excludes the mapped toolset; capability ``true`` and
    plain tools rows ensure it is enabled. ``disabled: true`` tools rows
    exclude. ``"all"`` in enabled is honored (leave as-is for ensure rows).
    """
    enabled = list(enabled_toolsets or [])
    disabled = list(disabled_toolsets or [])
    if preset is None or preset.broken:
        return enabled, disabled
    all_enabled = any(t in enabled for t in ("all", "*"))

    def _exclude(toolset: str) -> None:
        if toolset and toolset not in disabled:
            disabled.append(toolset)

    def _ensure(toolset: str) -> None:
        if toolset and toolset not in enabled and not all_enabled:
            enabled.append(toolset)

    for key, value in (preset.capabilities or {}).items():
        toolset = _CAPABILITY_TOOLSETS.get(key)
        if not toolset:
            continue
        if value:
            _ensure(toolset)
        else:
            _exclude(toolset)

    for row in preset.tools or []:
        toolset = row.get("toolset")
        if not toolset:
            continue
        if row.get("disabled"):
            _exclude(toolset)
        else:
            _ensure(toolset)
    return enabled, disabled


def apply_preset_skills(
    preset: AgentPreset,
) -> Tuple[Optional[List[str]], List[str]]:
    """Resolve a preset's skills line into (allow, deny) skill-name lists.

    ``allow`` is ``None`` when the preset leaves the default set untouched,
    an empty list when skills are turned off (``[]``), or the allow-list of
    names the system-prompt index is restricted to. ``deny`` holds ``~name``
    exclusions. A preset with no skills line returns ``(None, [])``.
    """
    skills = preset.skills if preset is not None and not preset.broken else None
    if skills is None:
        return None, []
    allow: List[str] = []
    deny: List[str] = []
    for name in skills:
        if not isinstance(name, str) or not name.strip():
            continue
        entry = name.strip()
        if entry.startswith("~"):
            deny.append(entry[1:])
        else:
            allow.append(entry)
    return allow, deny
