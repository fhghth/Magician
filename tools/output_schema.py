"""
Tool output schema validation and render separation — P4 harness alignment.

Aligned with deepseek-harness's ``defineTool`` output contract
(``packages/core/tools/src/schema.ts`` → ``DefineToolOptions.output``):

* **output.schema** — a JSON Schema enforced against every successful tool
  result.  Invalid results become a structured error rather than silently
  passing malformed data to the model.
* **output.render** — a pure function that maps the validated canonical value
  to the model-facing content (a string).  This separates the *canonical*
  tool result (structured data) from its *presentation* (what the model sees),
  so the same tool can render differently for different contexts without
  changing the execution logic.
* **presentation_meta** — optional pure function returning replayable display
  metadata for UI surfaces (not sent to the model).

This is the infrastructure layer.  Existing tools that don't declare an
output schema continue to work unchanged — their raw JSON-string return is
passed through as-is.  Tools that opt in get validation + render separation.

Design constraints (Hermes-specific):

* The core is a narrow waist.  This is an opt-in extension, not a rewrite of
  ``tools/registry.py``.  New tools should declare output schemas; existing
  tools migrate incrementally.
* All handlers MUST return a JSON string (Hermes's existing contract).  The
  render function's output is JSON-encoded before returning, so the model
  always sees valid JSON.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

# ── Types ──────────────────────────────────────────────────────────────────

# A render function maps the validated canonical value + tool args to the
# model-facing content string.
OutputRenderer = Callable[[Any, Dict[str, Any]], str]

# A presentation-meta function maps the validated value + args to display
# metadata (not sent to the model).
PresentationMetaFn = Callable[[Any, Dict[str, Any]], Any]


@dataclass
class ToolOutputSpec:
    """Declarative output contract for a tool.

    Mirrors harness ``DefineToolOptions.output``.  When a tool registers with
    an output spec, every successful result is validated against ``schema``
    and then rendered via ``render``.
    """

    # JSON Schema (Python dict) enforced against the canonical result value.
    # When None, no validation is performed (backward-compatible pass-through).
    schema: Optional[Dict[str, Any]] = None

    # Pure render function: (canonical_value, tool_args) -> model-facing string.
    # When None, the canonical value is JSON-encoded as-is.
    render: Optional[OutputRenderer] = None

    # Optional presentation-meta function for UI display (not model-facing).
    presentation_meta: Optional[PresentationMetaFn] = None

    # When True, validation failures return a structured error JSON instead of
    # raising.  Default True — a tool shouldn't crash the agent loop because
    # its output drifted from the schema.
    soft_validation: bool = True


@dataclass
class OutputProcessingResult:
    """The result of processing a tool output through schema + render."""

    # The final JSON string to return to the model / agent loop.
    output_json: str

    # The validated canonical value (before rendering).  None if validation
    # failed and soft_validation produced an error.
    canonical_value: Any = None

    # Whether validation was performed and passed.
    validated: bool = False

    # Whether validation failed (only meaningful when validated is False and
    # schema is not None).
    validation_failed: bool = False

    # The validation error message, if any.
    validation_error: Optional[str] = None

    # Presentation metadata, if the tool declared a presentation_meta function.
    presentation_meta: Any = None


# ── Schema validation ──────────────────────────────────────────────────────

def _validate_against_schema(value: Any, schema: Dict[str, Any]) -> Optional[str]:
    """Validate *value* against a JSON Schema *schema*.

    Returns None if valid, or an error message string if invalid.
    Uses ``jsonschema`` if available; falls back to a minimal type-check
    validator when the dependency isn't installed (Hermes doesn't depend on
    jsonschema by default).
    """
    try:
        import jsonschema  # type: ignore

        try:
            jsonschema.validate(instance=value, schema=schema)
            return None
        except jsonschema.ValidationError as exc:
            return f"schema validation failed at {list(exc.path)}: {exc.message}"
        except jsonschema.SchemaError as exc:
            return f"invalid output schema: {exc.message}"
    except ImportError:
        return _minimal_schema_validate(value, schema)


def _minimal_schema_validate(value: Any, schema: Dict[str, Any]) -> Optional[str]:
    """Minimal JSON Schema type validation (no jsonschema dependency).

    Supports: type, properties, required, items.  Enough to catch the common
    drift cases (wrong type, missing required keys).  Full validation requires
    the jsonschema package.
    """
    expected_type = schema.get("type")
    if expected_type:
        type_map = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "object": dict,
            "array": list,
            "null": type(None),
        }
        # Support union types: {"type": ["string", "null"]}
        if isinstance(expected_type, list):
            py_types = tuple(type_map.get(t) for t in expected_type if t in type_map)
            if py_types and not isinstance(value, py_types):
                return f"expected one of {expected_type}, got {type(value).__name__}"
        else:
            # bool is a subclass of int — exclude it when checking integer.
            if expected_type == "integer" and isinstance(value, bool):
                return f"expected integer, got boolean"
            py_type = type_map.get(expected_type)
            if py_type and not isinstance(value, py_type):
                return f"expected {expected_type}, got {type(value).__name__}"

    if expected_type == "object" and isinstance(value, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                return f"missing required property: {key}"
        for key, prop_schema in properties.items():
            if key in value:
                err = _minimal_schema_validate(value[key], prop_schema)
                if err:
                    return f"{key}: {err}"

    if expected_type == "array" and isinstance(value, list):
        items_schema = schema.get("items")
        if items_schema:
            for i, item in enumerate(value):
                err = _minimal_schema_validate(item, items_schema)
                if err:
                    return f"[{i}]: {err}"

    return None


# ── Output processing ──────────────────────────────────────────────────────

def process_tool_output(
    raw_result: Any,
    tool_args: Dict[str, Any],
    output_spec: Optional[ToolOutputSpec],
) -> OutputProcessingResult:
    """Process a tool's raw result through schema validation + render.

    Args:
        raw_result: The value returned by the tool handler.  May be a JSON
            string (legacy tools), a dict/list (canonical value), or any
            other Python object.
        tool_args: The validated tool arguments (for the render function).
        output_spec: The tool's output spec, or None for pass-through.

    Returns:
        An ``OutputProcessingResult`` with the final JSON string and metadata.
    """
    if output_spec is None:
        # Pass-through: legacy tools return JSON strings directly.
        if isinstance(raw_result, str):
            return OutputProcessingResult(output_json=raw_result)
        # Non-string raw result without a spec — JSON-encode it.
        return OutputProcessingResult(
            output_json=json.dumps(raw_result, ensure_ascii=False, default=str),
            canonical_value=raw_result,
        )

    # Step 1: Parse the canonical value.
    canonical = raw_result
    if isinstance(raw_result, str):
        # Legacy tool returned a JSON string — try to parse it as the canonical
        # value so we can validate and re-render.
        try:
            canonical = json.loads(raw_result)
        except (json.JSONDecodeError, TypeError):
            # Not valid JSON — pass through as-is (can't validate a non-JSON string).
            logger.debug("tool returned non-JSON string, skipping output validation")
            return OutputProcessingResult(output_json=raw_result)

    # Step 2: Validate against schema.
    if output_spec.schema is not None:
        err = _validate_against_schema(canonical, output_spec.schema)
        if err is not None:
            logger.warning("tool output schema validation failed: %s", err)
            if output_spec.soft_validation:
                error_json = json.dumps(
                    {"success": False, "error": f"output validation failed: {err}"},
                    ensure_ascii=False,
                )
                return OutputProcessingResult(
                    output_json=error_json,
                    canonical_value=canonical,
                    validated=False,
                    validation_failed=True,
                    validation_error=err,
                )
            else:
                raise ValueError(f"tool output schema validation failed: {err}")

    # Step 3: Render the canonical value.
    if output_spec.render is not None:
        try:
            rendered = output_spec.render(canonical, tool_args)
        except Exception as exc:
            logger.warning("tool output render function failed: %s", exc)
            rendered = json.dumps(canonical, ensure_ascii=False, default=str)
    else:
        rendered = json.dumps(canonical, ensure_ascii=False, default=str)

    # Step 4: Presentation metadata (UI-only, not model-facing).
    presentation_meta = None
    if output_spec.presentation_meta is not None:
        try:
            presentation_meta = output_spec.presentation_meta(canonical, tool_args)
        except Exception as exc:
            logger.debug("tool presentation_meta failed: %s", exc)

    return OutputProcessingResult(
        output_json=rendered if isinstance(rendered, str) else json.dumps(rendered, ensure_ascii=False, default=str),
        canonical_value=canonical,
        validated=output_spec.schema is not None,
        presentation_meta=presentation_meta,
    )


# ── Registry integration helper ────────────────────────────────────────────

def wrap_handler_with_output(
    handler: Callable[..., Any],
    output_spec: Optional[ToolOutputSpec],
) -> Callable[..., str]:
    """Wrap a tool handler so its output is processed through schema + render.

    The wrapped handler always returns a JSON string (Hermes's contract).
    When *output_spec* is None, the wrapper is a pass-through that ensures the
    return value is a JSON string.

    Usage in ``tools/registry.py``::

        from tools.output_schema import wrap_handler_with_output, ToolOutputSpec

        spec = ToolOutputSpec(
            schema={"type": "object", "required": ["success"]},
            render=lambda value, args: json.dumps({"ok": value["success"]}),
        )
        wrapped = wrap_handler_with_output(original_handler, spec)
    """
    if output_spec is None:
        def _passthrough(*args: Any, **kwargs: Any) -> str:
            result = handler(*args, **kwargs)
            if isinstance(result, str):
                return result
            return json.dumps(result, ensure_ascii=False, default=str)
        return _passthrough

    def _wrapped(*args: Any, **kwargs: Any) -> str:
        # Extract tool args for the render function.  The handler signature
        # varies (some take args dict, some take **kw), so we capture both.
        tool_args: Dict[str, Any] = {}
        if args and isinstance(args[0], dict):
            tool_args = args[0]
        elif kwargs:
            tool_args = kwargs

        raw_result = handler(*args, **kwargs)
        processed = process_tool_output(raw_result, tool_args, output_spec)
        return processed.output_json

    return _wrapped
