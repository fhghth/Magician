import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { TerminalSlot } from './persistent';
import { TerminalRail } from './rail';
import { $terminals } from './terminals';
/** Pane-side terminal chrome: the body slot (which the persistent overlay chases)
 *  plus the always-on tab rail. Lives in the real pane DOM — NOT the z-4 terminal
 *  overlay — so the rail sits above the collapsed sidebars' z-30 hover-reveal
 *  triggers (z-40, like the thread timeline) and suppresses them while hovered.
 *  The rail is always shown when a terminal exists (even one), so every tab keeps
 *  its close affordance; closing the last one hides the pane (reopen re-creates). */
export function TerminalPaneChrome() {
    const terminals = useStore($terminals);
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1", children: [_jsx("div", { className: "relative flex min-h-0 min-w-0 flex-1 flex-col", children: _jsx(TerminalSlot, {}) }), terminals.length > 0 && _jsx(TerminalRail, {})] }));
}
