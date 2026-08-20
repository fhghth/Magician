"""
Built-in system prompt sections — P5 harness alignment migration.

This module encapsulates all stable-tier system prompt sections as
registry-contributable definitions.  Each section declares:

* ``name`` — unique identifier (harness ``PromptSection.name``)
* ``order`` — render order (harness convention: -100 identity, 0 persona,
  100–199 tool guidance, 200+ environment/coding)
* ``condition`` — callable(agent) -> bool; only register when True
* ``text_fn`` — callable(agent) -> str; the section content

The ``register_builtin_sections(agent)`` function is called at agent init
time (or on first prompt build) to populate the ``SystemPromptRegistry``
with all sections whose condition holds for this agent.  The registry then
handles ordering, variable interpolation, and scoped overrides — so plugins
and features can contribute additional sections without touching
``system_prompt.py``.

Design constraints:
* Sections are conversation-stable.  ``condition`` and ``text_fn`` must not
  return different values on different turns for the same agent (that would
  break prompt caching).  Turn-varying content belongs in user messages.
* The registry is opt-in.  If ``register_builtin_sections`` is never called,
  ``build_system_prompt_parts`` falls back to the legacy inline construction
  (byte-identical to before this migration).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class BuiltinSectionDef:
    """Definition of one built-in system prompt section."""

    name: str
    order: float
    condition: Callable[[Any], bool]
    text_fn: Callable[[Any], str]


# ── Condition helpers ───────────────────────────────────────────────────────

def _has_tools(agent: Any) -> bool:
    return bool(getattr(agent, "valid_tool_names", None))


def _has_tool(agent: Any, tool_name: str) -> bool:
    return tool_name in (getattr(agent, "valid_tool_names", set()) or set())


def _has_any_tool(agent: Any, *tool_names: str) -> bool:
    tools = getattr(agent, "valid_tool_names", set()) or set()
    return any(t in tools for t in tool_names)


def _config_flag(agent: Any, attr: str, default: bool = True) -> bool:
    return bool(getattr(agent, attr, default))


def _model_contains(agent: Any, *substrings: str) -> bool:
    model = (getattr(agent, "model", "") or "").lower()
    return any(s in model for s in substrings)


# ── Section definitions ─────────────────────────────────────────────────────

def _identity_section(agent: Any) -> str:
    """SOUL.md or DEFAULT_AGENT_IDENTITY."""
    from agent.prompt_builder import DEFAULT_AGENT_IDENTITY
    _r = _get_run_agent()
    if getattr(agent, "load_soul_identity", True) or not getattr(agent, "skip_context_files", False):
        soul = _r.load_soul_md(None)
        if soul:
            return soul
    return DEFAULT_AGENT_IDENTITY


def _hermes_help_section(agent: Any) -> str:
    from agent.prompt_builder import HERMES_AGENT_HELP_GUIDANCE
    return HERMES_AGENT_HELP_GUIDANCE


def _task_completion_section(agent: Any) -> str:
    from agent.prompt_builder import TASK_COMPLETION_GUIDANCE
    return TASK_COMPLETION_GUIDANCE


def _parallel_tool_section(agent: Any) -> str:
    from agent.prompt_builder import PARALLEL_TOOL_CALL_GUIDANCE
    return PARALLEL_TOOL_CALL_GUIDANCE


def _tool_guidance_section(agent: Any) -> str:
    """Combined tool-specific guidance (memory, session_search, skills, kanban)."""
    from agent.prompt_builder import (
        MEMORY_GUIDANCE, SESSION_SEARCH_GUIDANCE, SKILLS_GUIDANCE, KANBAN_GUIDANCE,
    )
    parts = []
    if _has_tool(agent, "memory"):
        parts.append(MEMORY_GUIDANCE)
    if _has_tool(agent, "session_search"):
        parts.append(SESSION_SEARCH_GUIDANCE)
    if _has_tool(agent, "skill_manage"):
        parts.append(SKILLS_GUIDANCE)
    kanban = getattr(agent, "_kanban_worker_guidance", None)
    if kanban:
        parts.append(kanban)
    elif kanban is None and _has_tool(agent, "kanban_show"):
        parts.append(KANBAN_GUIDANCE)
    return " ".join(parts) if parts else ""


def _steer_channel_section(agent: Any) -> str:
    from agent.prompt_builder import STEER_CHANNEL_NOTE
    return STEER_CHANNEL_NOTE


def _computer_use_section(agent: Any) -> str:
    from agent.prompt_builder import computer_use_guidance
    return computer_use_guidance()


def _nous_subscription_section(agent: Any) -> str:
    _r = _get_run_agent()
    return _r.build_nous_subscription_prompt(getattr(agent, "valid_tool_names", set()))


def _tool_use_enforcement_section(agent: Any) -> str:
    """Tool-use enforcement guidance + model-specific operational guidance."""
    from agent.prompt_builder import (
        TOOL_USE_ENFORCEMENT_GUIDANCE, TOOL_USE_ENFORCEMENT_MODELS,
        GOOGLE_MODEL_OPERATIONAL_GUIDANCE, OPENAI_MODEL_EXECUTION_GUIDANCE,
    )
    parts = []
    enforce = getattr(agent, "_tool_use_enforcement", "auto")
    inject = False
    if enforce is True or (isinstance(enforce, str) and enforce.lower() in {"true", "always", "yes", "on"}):
        inject = True
    elif enforce is False or (isinstance(enforce, str) and enforce.lower() in {"false", "never", "no", "off"}):
        inject = False
    elif isinstance(enforce, list):
        model_lower = (getattr(agent, "model", "") or "").lower()
        inject = any(p.lower() in model_lower for p in enforce if isinstance(p, str))
    else:
        model_lower = (getattr(agent, "model", "") or "").lower()
        inject = any(p in model_lower for p in TOOL_USE_ENFORCEMENT_MODELS)
    if inject:
        parts.append(TOOL_USE_ENFORCEMENT_GUIDANCE)
        model_lower = (getattr(agent, "model", "") or "").lower()
        if "gemini" in model_lower or "gemma" in model_lower:
            parts.append(GOOGLE_MODEL_OPERATIONAL_GUIDANCE)
        if "gpt" in model_lower or "codex" in model_lower or "grok" in model_lower:
            parts.append(OPENAI_MODEL_EXECUTION_GUIDANCE)
    return "\n\n".join(parts) if parts else ""


def _alibaba_model_section(agent: Any) -> str:
    if getattr(agent, "provider", "") != "alibaba":
        return ""
    model = getattr(agent, "model", "")
    model_short = model.split("/")[-1] if "/" in model else model
    return (
        f"You are powered by the model named {model_short}. "
        f"The exact model ID is {model}. "
        f"When asked what model you are, always answer based on this information, "
        f"not on any model name returned by the API."
    )


def _environment_hints_section(agent: Any) -> str:
    _r = _get_run_agent()
    return _r.build_environment_hints()


def _coding_context_section(agent: Any) -> str:
    """Coding posture prefix + trailing parts (workspace snapshot handled separately)."""
    try:
        from agent.coding_context import coding_system_prompt_parts
        from agent.runtime_cwd import resolve_context_cwd
        prefix, _workspace, trailing = coding_system_prompt_parts(
            platform=getattr(agent, "platform", None),
            cwd=resolve_context_cwd(),
            model=getattr(agent, "model", None),
        )
        return "\n\n".join(prefix + trailing)
    except Exception:
        return ""


def _python_toolchain_section(agent: Any) -> str:
    """Local Python toolchain probe (emits nothing in clean environments)."""
    try:
        from agent.prompt_builder import build_python_toolchain_hint
        from agent.runtime_cwd import resolve_context_cwd
        return build_python_toolchain_hint(resolve_context_cwd())
    except Exception:
        return ""


def _platform_hints_section(agent: Any) -> str:
    from agent.prompt_builder import PLATFORM_HINTS
    platform = getattr(agent, "platform", "")
    return PLATFORM_HINTS.get(platform, "")


# ── Builtin section registry ────────────────────────────────────────────────

BUILTIN_SECTIONS: List[BuiltinSectionDef] = [
    # Identity tier (order -100 to -1)
    BuiltinSectionDef(
        name="identity",
        order=-100,
        condition=lambda agent: True,  # always has identity (SOUL.md or default)
        text_fn=_identity_section,
    ),
    BuiltinSectionDef(
        name="hermes_help",
        order=-90,
        condition=lambda agent: True,
        text_fn=_hermes_help_section,
    ),

    # Task/tool guidance tier (order 10-99)
    BuiltinSectionDef(
        name="task_completion",
        order=10,
        condition=lambda agent: _config_flag(agent, "_task_completion_guidance", True) and _has_tools(agent),
        text_fn=_task_completion_section,
    ),
    BuiltinSectionDef(
        name="parallel_tool_calls",
        order=20,
        condition=lambda agent: _config_flag(agent, "_parallel_tool_call_guidance", True) and _has_tools(agent),
        text_fn=_parallel_tool_section,
    ),
    BuiltinSectionDef(
        name="tool_guidance",
        order=30,
        condition=lambda agent: _has_any_tool(agent, "memory", "session_search", "skill_manage", "kanban_show"),
        text_fn=_tool_guidance_section,
    ),
    BuiltinSectionDef(
        name="steer_channel",
        order=40,
        condition=_has_tools,
        text_fn=_steer_channel_section,
    ),
    BuiltinSectionDef(
        name="computer_use",
        order=50,
        condition=lambda agent: _has_tool(agent, "computer_use"),
        text_fn=_computer_use_section,
    ),
    BuiltinSectionDef(
        name="nous_subscription",
        order=60,
        condition=lambda agent: bool(_nous_subscription_section(agent)),
        text_fn=_nous_subscription_section,
    ),
    BuiltinSectionDef(
        name="tool_use_enforcement",
        order=70,
        condition=_has_tools,
        text_fn=_tool_use_enforcement_section,
    ),

    # Model/provider identity tier (order 100-109)
    BuiltinSectionDef(
        name="alibaba_model_identity",
        order=100,
        condition=lambda agent: getattr(agent, "provider", "") == "alibaba",
        text_fn=_alibaba_model_section,
    ),

    # Environment tier (order 110-119)
    BuiltinSectionDef(
        name="environment_hints",
        order=110,
        condition=lambda agent: bool(_environment_hints_section(agent)),
        text_fn=_environment_hints_section,
    ),

    # Coding tier (order 120-129)
    BuiltinSectionDef(
        name="coding_context",
        order=120,
        condition=_has_tools,
        text_fn=_coding_context_section,
    ),
    BuiltinSectionDef(
        name="python_toolchain",
        order=125,
        condition=lambda agent: bool(_python_toolchain_section(agent)),
        text_fn=_python_toolchain_section,
    ),

    # Platform tier (order 130-139)
    BuiltinSectionDef(
        name="platform_hints",
        order=130,
        condition=lambda agent: bool(_platform_hints_section(agent)),
        text_fn=_platform_hints_section,
    ),
]


# ── Registration ────────────────────────────────────────────────────────────

def _get_run_agent():
    """Lazy reference to run_agent (preserves test patch contract)."""
    import run_agent
    return run_agent


def register_builtin_sections(agent: Any, scope: Optional[str] = None) -> int:
    """Register all built-in system prompt sections for *agent*.

    Evaluates each section's condition against the agent and registers the
    ones that pass into the ``SystemPromptRegistry``.  Sections that produce
    empty text are skipped (no token cost).

    Args:
        agent: the AIAgent instance.
        scope: optional scope key for per-agent overrides.  Defaults to the
            agent's session_id when available.

    Returns:
        The number of sections registered.
    """
    from agent.system_prompt_registry import SystemPromptRegistry, PromptSection

    if scope is None:
        scope = getattr(agent, "session_id", None)

    registry = SystemPromptRegistry.get_instance()
    registered = 0

    for section_def in BUILTIN_SECTIONS:
        try:
            if not section_def.condition(agent):
                continue
            text = section_def.text_fn(agent)
            if not text or not text.strip():
                continue
            registry.section(
                PromptSection(
                    name=section_def.name,
                    order=section_def.order,
                    text=text,
                ),
                scope=scope,
            )
            registered += 1
        except Exception as exc:
            logger.debug(
                "Failed to register builtin section %r: %s",
                section_def.name, exc,
            )

    logger.debug("Registered %d builtin system prompt sections (scope=%s)", registered, scope)
    return registered


def build_stable_parts_from_registry(agent: Any, scope: Optional[str] = None) -> List[str]:
    """Build the stable-tier prompt parts from the registry.

    Ensures builtin sections are registered for this agent, then renders the
    registry assembly and returns the section texts in order.  Returns an
    empty list if the registry has no sections (caller falls back to legacy
    construction).

    This is the migration entry point: ``build_system_prompt_parts`` calls
    this instead of inline construction when the registry path is active.
    """
    from agent.system_prompt_registry import (
        SystemPromptRegistry, AssembleContext, render_prompt,
    )

    if scope is None:
        scope = getattr(agent, "session_id", None)

    # Ensure builtin sections are registered for this agent.
    register_builtin_sections(agent, scope=scope)

    registry = SystemPromptRegistry.get_instance()
    assembly = registry.assemble(AssembleContext(scope=scope))
    rendered = render_prompt(assembly)

    if not rendered:
        return []

    # Split back into parts (the registry joins with "\n\n").  We return the
    # full rendered string as a single part to preserve exact byte ordering.
    return [rendered]
