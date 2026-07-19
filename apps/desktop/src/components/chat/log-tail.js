import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { CodeCardBody } from '@/components/chat/code-card';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
/** The shared terminal-log surface: CodeCardBody typography, a hover-reveal copy
 *  button, and follow-the-tail scrolling (releases when the user scrolls up).
 *  One component behind every log pane — MCP stdio/agent, hub action logs, etc.
 *  — so they all read, copy, and scroll identically. */
export function LogTail({ className, emptyLabel, lines }) {
    const scrollRef = useRef(null);
    const stickRef = useRef(true);
    useEffect(() => {
        const el = scrollRef.current;
        if (el && stickRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [lines]);
    return (_jsxs("div", { className: cn('group/logs relative h-full min-h-0', className), children: [_jsx(CopyButton, { appearance: "inline", className: "absolute right-2.5 top-1.5 z-10 h-5 gap-0 rounded-md px-1 opacity-5 transition-opacity group-hover/logs:opacity-100 hover:opacity-100 focus-visible:opacity-100", iconClassName: "size-3", showLabel: false, text: () => (lines ?? []).join('\n') }), _jsx("div", { className: "h-full min-h-0 overflow-y-auto [scrollbar-gutter:stable]", "data-selectable-text": "true", onScroll: event => {
                    const el = event.currentTarget;
                    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                }, ref: scrollRef, children: lines === null || lines.length === 0 ? (_jsx("p", { className: "px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-muted-foreground/50", children: lines === null ? '…' : emptyLabel })) : (_jsx(CodeCardBody, { children: _jsx("pre", { className: "whitespace-pre-wrap break-words", children: lines.map((line, index) => (_jsx("span", { className: cn('block', line.startsWith('=====') && 'mt-1 text-(--ui-text-tertiary)'), children: line }, index))) }) })) })] }));
}
