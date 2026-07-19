import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
/**
 * One collapsible group inside the composer status stack. Pure chrome — header
 * (caret + label) + body — styled to match the queue exactly so every status
 * (queue, subagents, background) reads as one piece. The stack supplies the
 * outer card and the dividers between groups; this owns only its own collapse.
 */
export function StatusSection({ accessory, children, defaultCollapsed = true, icon, label }) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-1 pr-1", children: [_jsxs("button", { className: "flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs font-normal text-muted-foreground/92 transition-colors hover:text-foreground/90", onClick: () => setCollapsed(open => !open), type: "button", children: [_jsx(DisclosureCaret, { className: "shrink-0", open: !collapsed, size: "1em" }), icon && _jsx("span", { className: "flex shrink-0 items-center", children: icon }), _jsx("span", { className: "truncate", children: label })] }), accessory && _jsx("div", { className: "flex shrink-0 items-center gap-1", children: accessory })] }), !collapsed && _jsx("div", { className: "px-1 pb-0.5", children: children })] }));
}
