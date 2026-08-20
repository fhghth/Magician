"""Skill Catalog Manager — inject available-skills index as a user message.

Aligned with deepseek-harness's ``tool-skill`` catalog injection
(``packages/skill/tool-skill/src/index.ts`` → ``SkillCatalogPublisher``):

* The available-skills index is rendered as a **user message** (not part of
  the system prompt) so the system prompt stays byte-stable for prompt
  caching.
* A SHA-256 digest of the rendered catalog detects changes: an unchanged
  catalog is not republished on subsequent turns (the model already saw it).
* Context compression resets the digest so the catalog is republished on the
  next turn (the compressed history no longer carries the original catalog
  message).

This is the first phase of P1 alignment.  The system-prompt skills index
(``build_skills_system_prompt``) is still emitted alongside this catalog
message; removing it from the system prompt is a follow-up gated on
stability of this injection path.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Marker prefix so a catalog message can be recognised in conversation
# history (e.g. by compression paths that need to strip or preserve it).
CATALOG_MARKER = "<!-- hermes-skill-catalog -->"

# P3 harness alignment: filesystem-change detection without a native watcher
# dependency.  We track an mtime:size stamp per skills directory; when any
# stamp changes we drop ``build_skills_system_prompt``'s LRU cache so the
# next catalog build re-scans the filesystem.  This mirrors harness's
# chokidar-based ``SkillWatchManager.invalidate()`` at a fraction of the
# complexity — the check runs once per turn (inside build_catalog) and is
# O(number of skill roots), not O(number of files).
_skills_dir_stamps: Dict[str, str] = {}
_skills_dir_stamps_lock = threading.Lock()


def _compute_dir_stamp(path: Path) -> str:
    """Return a stable ``mtime_ns:size`` stamp for a directory, or '' if absent."""
    try:
        st = path.stat()
        return f"{st.st_mtime_ns}:{st.st_size}"
    except OSError:
        return ""


def _check_skills_dir_changes() -> bool:
    """Check whether any skills directory changed since the last call.

    Returns True if at least one directory's stamp changed (or this is the
    first call).  When True, ``build_skills_system_prompt``'s LRU cache is
    cleared so the next catalog build sees fresh data.  Thread-safe.
    """
    try:
        from agent.skill_utils import get_all_skills_dirs
    except Exception:
        return False

    dirs = get_all_skills_dirs()
    current: Dict[str, str] = {}
    changed = False
    for d in dirs:
        key = str(d)
        stamp = _compute_dir_stamp(d)
        current[key] = stamp

    with _skills_dir_stamps_lock:
        if not _skills_dir_stamps:
            # First call: record stamps but don't treat as "changed" (no
            # prior state to invalidate against).
            _skills_dir_stamps.update(current)
            return False
        for key, stamp in current.items():
            if _skills_dir_stamps.get(key) != stamp:
                changed = True
                break
        if not changed:
            # Check for removed directories.
            for key in _skills_dir_stamps:
                if key not in current:
                    changed = True
                    break
        if changed:
            _skills_dir_stamps.clear()
            _skills_dir_stamps.update(current)

    if changed:
        try:
            from agent.prompt_builder import clear_skills_system_prompt_cache

            clear_skills_system_prompt_cache()
            logger.debug("skill catalog: skills dir changed, cleared prompt cache")
        except Exception as exc:
            logger.debug("skill catalog: failed to clear prompt cache: %s", exc)

    return changed


@dataclass
class SkillCatalog:
    """A rendered available-skills catalog with its content digest."""

    text: str
    digest: str
    skill_count: int


def _render_catalog(entries: List[Tuple[str, str]]) -> str:
    """Render the available-skills block.

    Mirrors harness ``SkillCatalogPublisher._renderAvailableSkills``: a
    ``<system-reminder>`` wrapped ``<available_skills>`` list.  Each entry
    is ``- <name>: <description>``.
    """
    if not entries:
        body = "  (no skills available)"
    else:
        body = "\n".join(f"  - {name}: {desc}" for name, desc in entries)
    return (
        f"{CATALOG_MARKER}\n"
        f"<system-reminder>\n"
        f"<available_skills>\n"
        f"{body}\n"
        f"</available_skills>\n"
        f"Use the skill_view tool to load a skill's full instructions. "
        f"Only skills listed above are available in this session.\n"
        f"</system-reminder>"
    )


def _collect_skills(agent: Any) -> List[Tuple[str, str]]:
    """Collect (name, description) pairs for skills visible to this agent.

    Reuses ``build_skills_system_prompt``'s discovery + filtering logic
    (platform gating, preset allow/deny) but extracts only the index entries
    rather than the full system-prompt block.  Then filters out skills with
    ``disable-model-invocation: true`` (P2 harness alignment) — those skills
    are user-invocable only (slash command) and must not appear in the
    model-facing catalog.
    """
    from agent.prompt_builder import build_skills_system_prompt

    # build_skills_system_prompt returns the rendered index text.  We parse
    # the name/description pairs out of it for the catalog.  The parser is
    # defensive: any line that doesn't match the expected format is skipped.
    try:
        index_text = build_skills_system_prompt(
            available_tools=getattr(agent, "valid_tool_names", set()),
            available_toolsets=getattr(agent, "enabled_toolsets", None),
            only_skill_names=getattr(agent, "_preset_skill_allow", None),
            deny_skill_names=tuple(getattr(agent, "_preset_skill_deny", ()) or ()),
        )
    except Exception as exc:
        logger.debug("skill catalog: build_skills_system_prompt failed: %s", exc)
        return []

    entries = _parse_skill_index(index_text)

    # P2: filter out disable-model-invocation skills.  Scan the skill dirs
    # for frontmatter flags; this is a lightweight pass (only SKILL.md files,
    # no content rendering) and the result is digest-cached by the caller.
    hidden_names = _collect_model_hidden_skill_names()
    if hidden_names:
        entries = [(n, d) for n, d in entries if n not in hidden_names]

    return entries


def _collect_model_hidden_skill_names() -> set:
    """Return the set of skill names with ``disable-model-invocation: true``.

    Scans all skill directories (local + external) and parses each SKILL.md
    frontmatter.  Skills without the flag (or with it set to false) are not
    included.  The frontmatter ``name:`` field is used as the canonical name;
    if absent, the parent directory name is used.
    """
    hidden: set = set()
    try:
        from agent.skill_utils import get_all_skills_dirs, parse_frontmatter
        from pathlib import Path

        for skills_dir in get_all_skills_dirs():
            if not skills_dir.is_dir():
                continue
            for skill_md in skills_dir.rglob("SKILL.md"):
                try:
                    content = skill_md.read_text(encoding="utf-8")
                    fm, _ = parse_frontmatter(content)
                    if fm.get("disable-model-invocation") is True:
                        name = fm.get("name") or skill_md.parent.name
                        hidden.add(str(name))
                except Exception:
                    continue
    except Exception as exc:
        logger.debug("skill catalog: _collect_model_hidden_skill_names failed: %s", exc)
    return hidden


def _parse_skill_index(index_text: str) -> List[Tuple[str, str]]:
    """Parse name/description pairs out of the rendered skills index.

    The index format (from ``prompt_builder._render_skills_index``) is a
    list of lines like ``- <name>: <description>`` or ``  <name>:
    <description>``.  We match the first colon as the name/description
    separator.
    """
    entries: List[Tuple[str, str]] = []
    for line in (index_text or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("Available"):
            continue
        # Strip leading bullet markers
        if stripped.startswith("- "):
            stripped = stripped[2:]
        elif stripped.startswith("* "):
            stripped = stripped[2:]
        # Split on first colon
        if ":" in stripped:
            name, _, desc = stripped.partition(":")
            name = name.strip()
            desc = desc.strip()
            if name:
                entries.append((name, desc))
    return entries


def build_catalog(agent: Any) -> SkillCatalog:
    """Build the available-skills catalog for this agent.

    Returns a ``SkillCatalog`` with rendered text, SHA-256 digest, and
    skill count.  The digest covers only the name+description pairs (not the
    wrapper markup) so a markup-only change doesn't trigger a republish.
    """
    # P3: detect skills-directory filesystem changes and drop the prompt
    # builder cache so the scan below sees fresh data.  No-op on the first
    # call (records baseline stamps) and when nothing changed.
    _check_skills_dir_changes()
    entries = _collect_skills(agent)
    text = _render_catalog(entries)
    # Digest over the canonical entry list (name + description) for stable
    # change detection independent of rendering tweaks.
    canonical = "\n".join(f"{name}\t{desc}" for name, desc in entries)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return SkillCatalog(text=text, digest=digest, skill_count=len(entries))


def should_republish(agent: Any, new_digest: str) -> bool:
    """Decide whether the catalog should be (re)published this turn.

    Republishes when:
      * No catalog has been published yet (``_skill_catalog_digest`` is None).
      * The digest changed since the last publish (skills added/removed).
      * The agent was flagged for catalog reset (e.g. after context
        compression, which drops the original catalog message from history).

    Does NOT republish when the digest is unchanged — the model already has
    the catalog in its conversation history.
    """
    last_digest = getattr(agent, "_skill_catalog_digest", None)
    reset_flag = getattr(agent, "_skill_catalog_needs_republish", False)
    if reset_flag:
        return True
    if last_digest is None:
        return True
    return last_digest != new_digest


def mark_published(agent: Any, digest: str) -> None:
    """Record that a catalog with ``digest`` has been published this turn."""
    agent._skill_catalog_digest = digest
    agent._skill_catalog_needs_republish = False


def request_republish(agent: Any) -> None:
    """Flag the agent to republish the catalog on the next turn.

    Called by context-compression paths after the conversation history is
    rewritten (the original catalog user message is gone, so the model needs
    to see it again).
    """
    agent._skill_catalog_needs_republish = True


def maybe_inject_catalog(
    agent: Any,
    messages: List[dict],
    *,
    user_message_idx: Optional[int] = None,
) -> bool:
    """Inject the skills catalog as a user message if it needs republishing.

    The catalog is inserted **before** the current user message (at
    ``user_message_idx`` if given, else at the end of ``messages`` before
    appending).  Returns True if a catalog message was injected.

    This is the integration point called from ``turn_context.build_turn_context``
    after the system prompt is restored/built and before the user message is
    appended.
    """
    # Skip if the skills toolset isn't loaded — no skill_view tool means the
    # catalog is useless and would confuse the model.
    valid_tools = getattr(agent, "valid_tool_names", set()) or set()
    if "skill_view" not in valid_tools:
        return False

    try:
        catalog = build_catalog(agent)
    except Exception as exc:
        logger.debug("skill catalog: build failed, skipping injection: %s", exc)
        return False

    if not should_republish(agent, catalog.digest):
        return False

    catalog_msg = {"role": "user", "content": catalog.text}
    if user_message_idx is not None and 0 <= user_message_idx <= len(messages):
        messages.insert(user_message_idx, catalog_msg)
    else:
        messages.append(catalog_msg)

    mark_published(agent, catalog.digest)
    logger.debug(
        "skill catalog injected (%d skills, digest=%s)",
        catalog.skill_count,
        catalog.digest,
    )
    return True
