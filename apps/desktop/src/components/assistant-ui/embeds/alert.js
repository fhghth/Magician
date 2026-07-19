import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { cloneElement, isValidElement } from 'react';
import { AlertCircle, AlertTriangle, Info, Zap } from '@/lib/icons';
import { cn } from '@/lib/utils';
// GitHub's five alert kinds, mapped to our icon set + a tinted accent.
const ALERT_STYLES = {
    caution: { accent: 'text-rose-600 dark:text-rose-400', icon: AlertTriangle, label: 'Caution' },
    important: { accent: 'text-violet-600 dark:text-violet-400', icon: AlertCircle, label: 'Important' },
    note: { accent: 'text-blue-600 dark:text-blue-400', icon: Info, label: 'Note' },
    tip: { accent: 'text-emerald-600 dark:text-emerald-400', icon: Zap, label: 'Tip' },
    warning: { accent: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle, label: 'Warning' }
};
const MARKER_RE = /^\s*\[!(note|tip|important|warning|caution)\]\s*\n?/i;
function firstText(node) {
    if (typeof node === 'string') {
        return node;
    }
    if (typeof node === 'number') {
        return String(node);
    }
    if (Array.isArray(node)) {
        for (const child of node) {
            const text = firstText(child);
            if (text.trim()) {
                return text;
            }
        }
        return '';
    }
    if (isValidElement(node)) {
        return firstText(node.props.children);
    }
    return '';
}
// Remove the leading `[!TYPE]` token from the first text node that carries it,
// leaving the rest of the blockquote body intact. One-shot via the `state` flag.
function stripMarker(node, state) {
    if (state.done) {
        return node;
    }
    if (typeof node === 'string') {
        const replaced = node.replace(MARKER_RE, '');
        if (replaced !== node) {
            state.done = true;
            return replaced;
        }
        return node;
    }
    if (Array.isArray(node)) {
        return node.map((child, index) => _jsx(Fragmentless, { node: stripMarker(child, state) }, index));
    }
    if (isValidElement(node)) {
        const children = node.props.children;
        if (children == null) {
            return node;
        }
        return cloneElement(node, undefined, stripMarker(children, state));
    }
    return node;
}
// Tiny helper so the array branch can return keyed nodes without wrapping
// strings in extra elements (React renders the raw node).
function Fragmentless({ node }) {
    return _jsx(_Fragment, { children: node });
}
/**
 * Detect a GitHub-style alert blockquote (`> [!NOTE]`). Returns the alert kind
 * and the body with the marker stripped, or null for a plain blockquote.
 */
export function extractAlert(children) {
    const match = firstText(children).match(MARKER_RE);
    if (!match) {
        return null;
    }
    return { body: stripMarker(children, { done: false }), type: match[1].toLowerCase() };
}
export function MarkdownAlert({ children, type }) {
    const style = ALERT_STYLES[type];
    const Icon = style.icon;
    return (_jsxs("div", { className: "my-2 rounded-lg border border-border bg-muted/25 px-3 py-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", "data-slot": "aui_markdown-alert", children: [_jsxs("div", { className: cn('mb-1 flex items-center gap-1.5 text-[0.8125rem] font-semibold', style.accent), children: [_jsx(Icon, { className: "size-4 shrink-0" }), style.label] }), children] }));
}
