import { jsx as _jsx } from "react/jsx-runtime";
import { Fragment, useMemo } from 'react';
import { DirectiveContent } from '@/components/assistant-ui/directive-text';
import { cn } from '@/lib/utils';
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
// Greedy backtick run length so ``code with `backticks` inside`` works.
const INLINE_CODE_RE = /(`+)([^`\n][\s\S]*?)\1/g;
function splitFences(text) {
    const segments = [];
    let cursor = 0;
    for (const match of text.matchAll(FENCE_RE)) {
        const start = match.index ?? 0;
        if (start > cursor) {
            segments.push({ kind: 'inline', text: text.slice(cursor, start) });
        }
        segments.push({
            kind: 'fence',
            lang: (match[1] || '').trim() || null,
            code: match[2] ?? ''
        });
        cursor = start + match[0].length;
    }
    if (cursor < text.length) {
        segments.push({ kind: 'inline', text: text.slice(cursor) });
    }
    return segments;
}
function splitInlineCode(text) {
    const nodes = [];
    let cursor = 0;
    for (const match of text.matchAll(INLINE_CODE_RE)) {
        const start = match.index ?? 0;
        if (start > cursor) {
            nodes.push({ kind: 'inline-text', text: text.slice(cursor, start) });
        }
        nodes.push({ kind: 'inline-code', code: match[2] });
        cursor = start + match[0].length;
    }
    if (cursor < text.length) {
        nodes.push({ kind: 'inline-text', text: text.slice(cursor) });
    }
    return nodes;
}
export const UserMessageText = ({ className, text }) => {
    const top = useMemo(() => splitFences(text), [text]);
    return (_jsx("span", { className: cn('block', className), "data-slot": "aui_user-message-text", children: top.map((segment, segmentIndex) => {
            if (segment.kind === 'fence') {
                return (_jsx("pre", { className: "my-1.5 max-w-full overflow-x-auto rounded-md border border-border/45 bg-[color-mix(in_srgb,currentColor_5%,transparent)] px-2.5 py-2 font-mono text-[0.86em] leading-snug", "data-slot": "aui_user-fence", children: _jsx("code", { className: "block whitespace-pre", children: segment.code }) }, `fence-${segmentIndex}`));
            }
            return (_jsx(Fragment, { children: _jsx(InlineSegmentView, { text: segment.text }) }, `inline-${segmentIndex}`));
        }) }));
};
const InlineSegmentView = ({ text }) => {
    const nodes = useMemo(() => splitInlineCode(text), [text]);
    return (_jsx("span", { className: "wrap-anywhere block whitespace-pre-line", "data-slot": "aui_user-inline-text", children: nodes.map((node, nodeIndex) => node.kind === 'inline-code' ? (_jsx("code", { className: "mx-px rounded bg-[color-mix(in_srgb,currentColor_8%,transparent)] px-1 py-px font-mono text-[0.92em]", "data-slot": "aui_user-inline-code", children: node.code }, `code-${nodeIndex}`)) : (_jsx(Fragment, { children: _jsx(DirectiveContent, { text: node.text }) }, `text-${nodeIndex}`))) }));
};
