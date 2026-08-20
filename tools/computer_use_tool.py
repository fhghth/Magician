"""Shim for tool discovery. Registers `computer_use` with tools.registry.

The real implementation lives in the `tools/computer_use/` package to keep
the file structure clean. This shim exists because tools.registry auto-imports
`tools/*.py` — we need a top-level module to trigger the registration.
"""

from __future__ import annotations

import json

from tools.computer_use.schema import COMPUTER_USE_SCHEMA
from tools.computer_use.tool import (
    check_computer_use_requirements,
    handle_computer_use,
    release_computer_use_session,
    set_approval_callback,
)
from tools.output_schema import ToolOutputSpec
from tools.registry import registry


registry.register(
    name="computer_use",
    toolset="computer_use",
    schema=COMPUTER_USE_SCHEMA,
    handler=lambda args, **kw: handle_computer_use(args, **kw),
    check_fn=check_computer_use_requirements,
    requires_env=[],
    description=(
        "Universal desktop control via cua-driver (macOS, Windows, Linux). Works with any "
        "tool-capable model (Anthropic, OpenAI, OpenRouter, local vLLM, "
        "etc.). Background computer-use: does NOT steal the user's cursor "
        "or keyboard focus."
    ),
    output_spec=ToolOutputSpec(
        # Permissive schema: `computer_use` returns either a text-only
        # AX snapshot (mode/width/height/app/window_title/elements/
        # summary) or a `_multimodal` envelope (screenshot + summary) —
        # the multimodal dict is passed through untouched by registry
        # dispatch, so only the text shapes reach this schema/render.
        schema={
            "type": "object",
            "properties": {
                "mode": {"type": ["string", "null"]},
                "width": {"type": ["integer", "null"]},
                "height": {"type": ["integer", "null"]},
                "app": {"type": ["string", "null"]},
                "window_title": {"type": ["string", "null"]},
                "summary": {"type": ["string", "null"]},
                "total_elements": {"type": ["integer", "null"]},
                "success": {"type": "boolean"},
                "error": {"type": ["string", "null"]},
            },
        },
        render=lambda value, args: json.dumps({
            **value,
            "_rendered": (
                f"Screen ({value.get('width')}x{value.get('height')}, "
                f"{value.get('total_elements', 0)} elements): "
                f"{value.get('summary', '')[:300]}"
                + (f" — {value.get('error')}" if value.get("error") else "")
            ),
        }, ensure_ascii=False),
    ),
)


__all__ = [
    "handle_computer_use",
    "release_computer_use_session",
    "set_approval_callback",
    "check_computer_use_requirements",
    "release_computer_use_session",
]
