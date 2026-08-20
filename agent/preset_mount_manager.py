"""Preset Mount Manager — standing mount cache for agent presets.

Aligned with deepseek-harness's standing-mount semantics
(``packages/preset/agent-presets/src/mount.ts``):

* Each preset is resolved once and cached by ``(preset_id, file_stamp)``.
* All agents naming the same preset share the same resolved composition
  (ensure/exclude toolsets, skill allow/deny, persona).
* A file change invalidates the cache for *new* sessions; existing sessions
  keep their reference (generation isolation — harness ``mount.ts``
  ``fileStamp`` behaviour).
* Thread-safe: the cache is guarded by a lock so concurrent agent inits
  (gateway fan-out, batch runner) don't race on resolution.

The cached object is **preset-independent of caller inputs**: it stores the
preset's own ensure/exclude/allow/deny/persona, not the merged result.
Merging into the caller's ``enabled_toolsets`` / ``disabled_toolsets``
happens at agent-init time so a preset change never mutates another agent's
already-resolved lists.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class PresetMount:
    """A resolved preset composition — shared by all agents with this preset.

    Fields are the preset's *own* contributions, pre-merge.  Agent init
    merges ``ensure_toolsets`` / ``exclude_toolsets`` into the caller's
    toolset lists and applies ``skill_allow`` / ``skill_deny`` / ``persona``
    directly.
    """

    preset_id: str
    persona: Optional[dict] = None
    ensure_toolsets: List[str] = field(default_factory=list)
    exclude_toolsets: List[str] = field(default_factory=list)
    skill_allow: Optional[List[str]] = None  # None = default, [] = no skills
    skill_deny: List[str] = field(default_factory=list)
    stamp: str = ""


def _composition_stamp(preset_path: Path, composition_file: str) -> str:
    """Compute a file stamp from mtime_ns + size of the composition file.

    A missing file yields ``"missing"`` so a broken preset never matches a
    previously cached good stamp.
    """
    path = preset_path / composition_file
    if not path.is_file():
        return "missing"
    try:
        stat = path.stat()
        return f"{stat.st_mtime_ns}:{stat.st_size}"
    except OSError:
        return "unreadable"


class PresetMountManager:
    """Thread-safe singleton cache of resolved preset compositions.

    Usage::

        mgr = PresetMountManager()
        mount = mgr.resolve("my-preset")
        if mount:
            # merge mount.ensure_toolsets / exclude_toolsets into caller lists
            # apply mount.skill_allow / skill_deny / persona
    """

    _instance: Optional["PresetMountManager"] = None
    _singleton_lock = threading.Lock()

    def __new__(cls) -> "PresetMountManager":
        if cls._instance is None:
            with cls._singleton_lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._cache: Dict[str, PresetMount] = {}
                    inst._cache_lock = threading.Lock()
                    cls._instance = inst
        return cls._instance

    # ── Public API ────────────────────────────────────────────────────────

    def resolve(self, preset_id: str) -> Optional[PresetMount]:
        """Resolve a preset — cached hit or fresh parse.

        Returns ``None`` when the preset is unknown or broken.  A cached
        entry whose stamp no longer matches the composition file is treated
        as a miss (generation invalidation).
        """
        from hermes_cli.agent_presets import (
            COMPOSITION_FILE,
            _CAPABILITY_TOOLSETS,
            find_preset,
            load_preset,
        )

        # Fast path: cached + stamp matches.
        preset = find_preset(preset_id)
        if preset is None or preset.broken:
            return None

        stamp = _composition_stamp(preset.path, COMPOSITION_FILE)
        with self._cache_lock:
            cached = self._cache.get(preset_id)
            if cached is not None and cached.stamp == stamp:
                return cached

        # Slow path: load + resolve (outside the lock so concurrent inits
        # of *different* presets don't block each other).
        try:
            loaded = load_preset(preset_id)
        except ValueError:
            return None

        mount = self._build_mount(loaded, stamp, _CAPABILITY_TOOLSETS)

        with self._cache_lock:
            # Another thread may have populated it while we parsed; last-writer
            # wins because the stamp is identical for the same file state.
            self._cache[preset_id] = mount

        logger.debug(
            "preset mount resolved: %s (stamp=%s, ensure=%d, exclude=%d, skills=%s)",
            preset_id,
            stamp,
            len(mount.ensure_toolsets),
            len(mount.exclude_toolsets),
            "default" if mount.skill_allow is None else f"{len(mount.skill_allow)} allow",
        )
        return mount

    def get_cached(self, preset_id: str) -> Optional[PresetMount]:
        """Return the cached mount without revalidating the file stamp.

        Useful for callers that already know the preset hasn't changed (e.g.
        mid-session recompose where the id is the same).  Returns ``None``
        when nothing is cached.
        """
        with self._cache_lock:
            return self._cache.get(preset_id)

    def invalidate(self, preset_id: Optional[str] = None) -> None:
        """Invalidate cache for one preset, or all presets when ``None``.

        Called by file-watchers (P3) and by ``/preset`` recompose paths
        that want a fresh parse on the next agent init.
        """
        with self._cache_lock:
            if preset_id is None:
                self._cache.clear()
                logger.debug("preset mount cache cleared (all)")
            else:
                self._cache.pop(preset_id, None)
                logger.debug("preset mount cache invalidated: %s", preset_id)

    # ── Internals ─────────────────────────────────────────────────────────

    @staticmethod
    def _build_mount(
        preset,  # AgentPreset (avoid circular import in signature)
        stamp: str,
        capability_toolsets: Dict[str, str],
    ) -> PresetMount:
        """Build a PresetMount from a loaded AgentPreset.

        Mirrors ``apply_preset_tools`` + ``apply_preset_skills`` but
        returns the preset's *own* contributions rather than merging into
        caller-supplied lists.
        """
        # Persona
        persona: Optional[dict] = None
        if preset.persona and str(preset.persona.get("text", "") or "").strip():
            persona = preset.persona

        # Tools/capabilities → ensure/exclude
        ensure: List[str] = []
        exclude: List[str] = []

        for key, value in (preset.capabilities or {}).items():
            toolset = capability_toolsets.get(key)
            if not toolset:
                continue
            if value:
                if toolset not in ensure:
                    ensure.append(toolset)
            else:
                if toolset not in exclude:
                    exclude.append(toolset)

        for row in preset.tools or []:
            toolset = row.get("toolset")
            if not toolset:
                continue
            if row.get("disabled"):
                if toolset not in exclude:
                    exclude.append(toolset)
            else:
                if toolset not in ensure:
                    ensure.append(toolset)

        # Skills allow/deny
        skill_allow: Optional[List[str]] = None
        skill_deny: List[str] = []
        if preset.skills is not None:
            skill_allow = []
            for name in preset.skills:
                if not isinstance(name, str) or not name.strip():
                    continue
                entry = name.strip()
                if entry.startswith("~"):
                    skill_deny.append(entry[1:])
                else:
                    skill_allow.append(entry)

        return PresetMount(
            preset_id=preset.id,
            persona=persona,
            ensure_toolsets=ensure,
            exclude_toolsets=exclude,
            skill_allow=skill_allow,
            skill_deny=skill_deny,
            stamp=stamp,
        )


def get_preset_mount_manager() -> PresetMountManager:
    """Convenience accessor for the singleton PresetMountManager."""
    return PresetMountManager()
