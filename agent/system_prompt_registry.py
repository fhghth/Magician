"""
System prompt contribution registry — P5 harness alignment.

Aligned with deepseek-harness's ``@deepseek-ai/dsh-system-prompt``
(``packages/core/system-prompt/src/index.ts`` → ``SystemPrompt`` service):

* Four contribution kinds: **sections** (ordered system-prompt paragraphs),
  **contexts** (dynamic runtime-context snapshots injected as user messages),
  **tools** (tool-schema providers — already handled by Hermes's existing
  ``tools/registry.py`` + ``toolsets.py``, so this registry does NOT duplicate
  that surface), and **variables** (``{{name}}`` interpolation placeholders).
* Scoped override: a global registry plus per-agent scope entries; the nearest
  scope wins on name collisions (harness ``ScopedLayers`` semantics).
* ``complete`` section: a single section marked ``complete=True`` replaces the
  entire assembled system prompt (harness ``PromptSection.complete``).
* Waterfall hook: ``assemble()`` emits a mutable assembly to registered
  transformers before rendering (harness ``system-prompt/assemble`` waterfall).

This is the infrastructure layer.  Existing ``agent/system_prompt.py`` continues
to work unchanged; callers that opt into the registry get the new contribution
model.  The registry is byte-stable for the life of a conversation: section
texts are resolved at assembly time (variable interpolation), and registered
sections must not mutate mid-conversation (that would break prompt caching).

Design constraints (Hermes-specific, not in harness):

* Prompt caching is sacred.  The assembled system prompt must be byte-stable
  for the life of a conversation.  Variable providers that return different
  values on different turns will break caching — callers must ensure variable
  values are conversation-stable, or use the user-message injection path
  (``agent/skill_catalog.py``) for turn-varying content.
* The core is a narrow waist.  This registry is an opt-in extension point,
  not a replacement for the existing system-prompt builder.  New capability
  should register sections/variables here rather than hardcoding into
  ``system_prompt.py``.
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Types ──────────────────────────────────────────────────────────────────

# A section/context text may be a static string or a provider function
# evaluated at assembly time with the assembly context.
TextProvider = Callable[["AssembleContext"], str]
TextOrProvider = str | TextProvider

# A variable provider returns the value for ``{{name}}`` interpolation.
VariableProvider = Callable[["AssembleContext"], Optional[str]]

# A waterfall transformer receives the mutable assembly and returns it
# (possibly modified).  Transformers run in registration order.
AssemblyTransformer = Callable[["PromptAssembly", "AssembleContext"], "PromptAssembly"]


@dataclass
class AssembleContext:
    """Merge-extensible context for one prompt assembly.

    Mirrors harness ``AssembleContext``: carries the scope key and an optional
    abort signal.  Hermes doesn't use Cordis scopes, so ``scope`` is an
    arbitrary string key (e.g. an agent id or profile name) that callers use
    to register per-agent overrides.
    """

    scope: Optional[str] = None
    # Per-assembly data bag — transformers can stash intermediate results here.
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PromptSection:
    """One contributed section of the system prompt (registry input).

    Mirrors harness ``PromptSection``.  Sections are concatenated in ascending
    ``order``.  Convention (from harness): ``-100`` is the agent identity,
    ``0`` the deployment persona, tool guidance uses 100–199.
    """

    name: str
    order: float
    text: TextOrProvider
    # When True, this section replaces the entire assembled system prompt.
    # More than one effective complete section makes assembly fail.
    complete: bool = False


@dataclass
class PromptContext:
    """Dynamic model context materialized as a durable user-role snapshot.

    Mirrors harness ``PromptContext``.  Unlike sections (which go into the
    system prompt), contexts are rendered as user messages (see
    ``render_context_snapshot``) so they can vary turn-to-turn without
    breaking the byte-stable system-prompt cache.
    """

    name: str
    order: float
    text: TextOrProvider


@dataclass
class AssembledSection:
    """One section of an assembly: PromptSection with its text resolved."""

    name: str
    text: str


@dataclass
class AssembledContext:
    """One resolved dynamic context contribution."""

    name: str
    text: str


@dataclass
class PromptAssembly:
    """Merge-extensible assembled model input.

    Mirrors harness ``PromptAssembly``.  Sections and contexts remain
    uninterpolated until rendered; tools are already in canonical order
    (handled by Hermes's existing tool infrastructure, not this registry).
    """

    sections: List[AssembledSection]
    contexts: List[AssembledContext]
    variables: Dict[str, Optional[str]]


# ── Variable interpolation ─────────────────────────────────────────────────

# Valid variable names: how they are written between the braces.
_VARIABLE_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
# A complete {{...}} reference group at the scan position.
_GROUP_AT = re.compile(r"^\{\{([^{}]*)\}\}")


def interpolate_text(
    text: str,
    variables: Dict[str, Optional[str]],
    owner_name: str,
    owner_kind: str = "section",
) -> str:
    """Interpolate strict ``{{variable}}`` references in *text*.

    Mirrors harness ``interpolate()``.  Malformed, unknown, or undefined
    references raise ValueError.  A lone ``{{`` without any later ``}}`` is
    literal prose.  Substituted values are not scanned again.
    """
    result = ""
    last = 0
    while True:
        open_pos = text.find("{{", last)
        if open_pos < 0:
            break
        group = _GROUP_AT.match(text[open_pos:])
        if group is None:
            # A later closing brace makes this malformed; otherwise literal.
            if text.find("}}", open_pos + 2) >= 0:
                raise ValueError(
                    f"malformed prompt variable reference at "
                    f'"{text[open_pos:open_pos + 16]}…" in {owner_kind} '
                    f'"{owner_name}" (references are complete simple {{name}} groups)'
                )
            result += text[last : open_pos + 2]
            last = open_pos + 2
            continue
        name = group[0][2:-2]
        if not _VARIABLE_NAME.match(name):
            raise ValueError(
                f'malformed prompt variable reference "{{{{{name}}}}}" in {owner_kind} '
                f'"{owner_name}" (variable names match {_VARIABLE_NAME.pattern})'
            )
        if name not in variables:
            known = ", ".join(sorted(variables.keys())) or "(none)"
            raise ValueError(
                f'unknown prompt variable "{{{{{name}}}}}" in {owner_kind} '
                f'"{owner_name}"; registered variables: {known}'
            )
        value = variables[name]
        if value is None:
            raise ValueError(
                f'prompt variable "{{{{{name}}}}}" has no value for this assembly '
                f'({owner_kind} "{owner_name}")'
            )
        result += text[last:open_pos] + value
        last = open_pos + len(group[0])
    return result + text[last:]


def render_prompt(assembly: PromptAssembly) -> str:
    """Render the assembled system prompt: interpolate, drop empty, join.

    Mirrors harness ``renderPrompt()``.  Returns ``''`` when all sections
    are empty.
    """
    return (
        "\n\n".join(
            text
            for text in (
                interpolate_text(s.text, assembly.variables, s.name, "section")
                for s in assembly.sections
            )
            if text
        )
    )


def render_context_snapshot(assembly: PromptAssembly) -> str:
    """Render the complete dynamic context snapshot as a user message.

    Mirrors harness ``renderContextSnapshot()`` + ``joinContextSections()``.
    Returns ``''`` when no context is active.
    """
    sections = [
        {"name": c.name, "text": interpolate_text(c.text, assembly.variables, c.name, "context")}
        for c in assembly.contexts
    ]
    sections = [s for s in sections if s["text"]]
    if not sections:
        return ""
    body = "\n\n".join(s["text"] for s in sections)
    return (
        "Current runtime context. This snapshot supersedes earlier "
        "runtime-context snapshots.\n\n" + body
    )


# ── Registry ───────────────────────────────────────────────────────────────


class _ScopeLayer:
    """All prompt registrations owned by one global or scoped layer."""

    def __init__(self) -> None:
        self.sections: Dict[str, PromptSection] = {}
        self.contexts: Dict[str, PromptContext] = {}
        self.variables: Dict[str, VariableProvider] = {}
        self.transformers: List[AssemblyTransformer] = []

    def is_empty(self) -> bool:
        return not (self.sections or self.contexts or self.variables or self.transformers)


class SystemPromptRegistry:
    """Registry service for the prompt inputs assembled before each model step.

    Mirrors harness ``SystemPrompt`` service.  Thread-safe singleton via
    ``get_instance()``.  Global registrations are shared across all agents;
    scoped registrations (keyed by an arbitrary scope string) override globals
    on name collisions.

    Usage::

        registry = SystemPromptRegistry.get_instance()

        # Register a global section
        registry.section(PromptSection(name="my-feature", order=50, text="..."))

        # Register a variable
        registry.variable("model_name", lambda ctx: "gpt-4")

        # Assemble for a scope (e.g. an agent id)
        assembly = registry.assemble(AssembleContext(scope="agent-123"))
        system_prompt = render_prompt(assembly)
    """

    _instance: Optional["SystemPromptRegistry"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._global = _ScopeLayer()
        self._scopes: Dict[str, _ScopeLayer] = {}
        self._lock = threading.RLock()

    @classmethod
    def get_instance(cls) -> "SystemPromptRegistry":
        """Return the process-wide singleton, creating it on first call."""
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton (for tests only)."""
        with cls._instance_lock:
            cls._instance = None

    # ── Registration ────────────────────────────────────────────────────

    def section(self, section: PromptSection, scope: Optional[str] = None) -> None:
        """Register an ordered prompt section.

        A scoped section shadows a global section with the same name.
        Duplicates within one layer raise ValueError.
        """
        if not isinstance(section.order, (int, float)) or not _is_finite(section.order):
            raise ValueError(f'prompt section "{section.name}" order must be a finite number')
        layer = self._get_layer(scope)
        with self._lock:
            if section.name in layer.sections:
                raise ValueError(
                    f'prompt section "{section.name}" is already registered'
                    + (f' in scope "{scope}"' if scope else "")
                )
            layer.sections[section.name] = section

    def context(self, context: PromptContext, scope: Optional[str] = None) -> None:
        """Register ordered dynamic context.

        Scoped entries shadow global entries with the same name.
        """
        if not isinstance(context.order, (int, float)) or not _is_finite(context.order):
            raise ValueError(f'prompt context "{context.name}" order must be a finite number')
        layer = self._get_layer(scope)
        with self._lock:
            if context.name in layer.contexts:
                raise ValueError(
                    f'prompt context "{context.name}" is already registered'
                    + (f' in scope "{scope}"' if scope else "")
                )
            layer.contexts[context.name] = context

    def variable(
        self,
        name: str,
        provider: VariableProvider,
        scope: Optional[str] = None,
    ) -> None:
        """Register a prompt variable.

        Scoped values shadow globals.  Invalid names raise ValueError.
        A provider may return ``None``, but rendering a section that references
        that value then fails.
        """
        if not _VARIABLE_NAME.match(name):
            raise ValueError(f'invalid prompt variable name "{name}" (must match {_VARIABLE_NAME.pattern})')
        layer = self._get_layer(scope)
        with self._lock:
            if name in layer.variables:
                raise ValueError(
                    f'prompt variable "{name}" is already registered'
                    + (f' in scope "{scope}"' if scope else "")
                )
            layer.variables[name] = provider

    def transformer(self, transformer: AssemblyTransformer, scope: Optional[str] = None) -> None:
        """Register an assembly waterfall transformer.

        Transformers run in registration order (global first, then scoped).
        Each receives the mutable assembly and must return it (possibly modified).
        """
        layer = self._get_layer(scope)
        with self._lock:
            layer.transformers.append(transformer)

    # ── Unregistration (for plugin disposal / tests) ────────────────────

    def remove_section(self, name: str, scope: Optional[str] = None) -> bool:
        """Remove a registered section.  Returns True if it existed."""
        layer = self._get_layer(scope, create=False)
        if layer is None:
            return False
        with self._lock:
            return layer.sections.pop(name, None) is not None

    def remove_context(self, name: str, scope: Optional[str] = None) -> bool:
        """Remove a registered context.  Returns True if it existed."""
        layer = self._get_layer(scope, create=False)
        if layer is None:
            return False
        with self._lock:
            return layer.contexts.pop(name, None) is not None

    def remove_variable(self, name: str, scope: Optional[str] = None) -> bool:
        """Remove a registered variable.  Returns True if it existed."""
        layer = self._get_layer(scope, create=False)
        if layer is None:
            return False
        with self._lock:
            return layer.variables.pop(name, None) is not None

    # ── Assembly ─────────────────────────────────────────────────────────

    def assemble(self, context: Optional[AssembleContext] = None) -> PromptAssembly:
        """Assemble global and scoped providers, then run the waterfall.

        Scoped sections/variables shadow globals.  The returned assembly has
        sections in ascending order, contexts in ascending order, and all
        variable providers evaluated.  If a ``complete`` section is present,
        it becomes the sole section (harness semantics).

        Mirrors harness ``SystemPrompt.assemble()``.
        """
        if context is None:
            context = AssembleContext()

        with self._lock:
            # Collect scope chain (global + matching scopes).
            # Hermes doesn't have nested scopes like harness, so it's just
            # global + the one named scope.
            layers: List[_ScopeLayer] = [self._global]
            if context.scope and context.scope in self._scopes:
                layers.append(self._scopes[context.scope])

            # Variables: scoped shadow globals.
            variables: Dict[str, Optional[str]] = {}
            for layer in layers:
                for name, provider in layer.variables.items():
                    try:
                        variables[name] = provider(context)
                    except Exception as exc:
                        logger.debug("variable provider %r failed: %s", name, exc)
                        variables[name] = None

            # Sections: scoped shadow globals, then sort by order.
            section_by_name: Dict[str, PromptSection] = {}
            for layer in layers:
                section_by_name.update(layer.sections)

            # Contexts: scoped shadow globals, then sort by order.
            context_by_name: Dict[str, PromptContext] = {}
            for layer in layers:
                context_by_name.update(layer.contexts)

            # Transformers: global first, then scoped.
            transformers: List[AssemblyTransformer] = []
            for layer in layers:
                transformers.extend(layer.transformers)

        # Resolve text providers (outside the lock to avoid deadlocks if a
        # provider calls back into the registry).
        section_defs = sorted(section_by_name.values(), key=lambda s: s.order)
        complete_sections = [s for s in section_defs if s.complete]
        if len(complete_sections) > 1:
            names = ", ".join(s.name for s in complete_sections)
            raise ValueError(f"multiple complete prompt sections are active: {names}")

        complete_section: Optional[AssembledSection] = None
        sections: List[AssembledSection] = []
        for s in section_defs:
            text = _resolve_text(s.text, context)
            assembled = AssembledSection(name=s.name, text=text)
            if s.complete:
                complete_section = assembled
            sections.append(assembled)

        context_defs = sorted(context_by_name.values(), key=lambda c: c.order)
        contexts = [
            AssembledContext(name=c.name, text=_resolve_text(c.text, context))
            for c in context_defs
        ]

        assembly = PromptAssembly(
            sections=sections,
            contexts=contexts,
            variables=variables,
        )

        # Run waterfall transformers.
        for transformer in transformers:
            try:
                assembly = transformer(assembly, context)
            except Exception as exc:
                logger.debug("assembly transformer failed: %s", exc)

        # Enforce complete section.
        if complete_section is not None:
            assembly.sections = [complete_section]

        return assembly

    # ── Internals ────────────────────────────────────────────────────────

    def _get_layer(self, scope: Optional[str], create: bool = True) -> _ScopeLayer:
        if scope is None:
            return self._global
        with self._lock:
            if scope not in self._scopes:
                if not create:
                    return self._global  # fallback; caller checks is_empty
                self._scopes[scope] = _ScopeLayer()
            return self._scopes[scope]


def _is_finite(value: float) -> bool:
    return value == value and value != float("inf") and value != float("-inf")


def _resolve_text(text: TextOrProvider, context: AssembleContext) -> str:
    """Resolve a static string or provider function to its text."""
    if callable(text):
        try:
            return text(context)
        except Exception as exc:
            logger.debug("text provider failed: %s", exc)
            return ""
    return text
