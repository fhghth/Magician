import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuiState } from '@assistant-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { activeTimelineIndex, deriveTimelineEntries } from './timeline-data';
const MIN_ENTRIES = 4;
const VIEWPORT = '[data-slot="aui_thread-viewport"]';
const HOVER_CLOSE_MS = 140;
const ROW_CLASS = 'row-hover relative flex w-full min-w-0 max-w-full select-none overflow-hidden rounded-md px-2 py-1 text-left outline-hidden';
// Surface (border-color/bg/shadow/blur) comes from the shared
// `[data-slot='thread-timeline-popover']` rule in styles.css, so it's 1:1 with
// the dropdown/select/dialog menus. We only own layout + the border/radius here.
const POPOVER_SHELL = 'absolute right-full top-1/2 z-50 max-h-[min(22rem,calc(100vh-8rem))] w-80 max-w-[min(20rem,calc(100vw-2rem))] -translate-y-1/2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border p-1 text-popover-foreground transition-[opacity,transform] duration-100 ease-out group-hover/timeline:transition-none';
function userPromptText(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }
    let out = '';
    for (const part of content) {
        if (typeof part === 'string') {
            out += part;
            continue;
        }
        if (!part || typeof part !== 'object') {
            continue;
        }
        const row = part;
        if ((!row.type || row.type === 'text') && typeof row.text === 'string') {
            out += row.text;
        }
    }
    return out;
}
/** Index-keyed ref-array setter — `ref={listRef(refs, i)}`. */
const listRef = (refs, index) => (node) => {
    refs.current[index] = node;
};
/** Mouse enter/leave pair forwarding `on` to the shared paint(). */
const hoverProps = (index, paint) => ({
    onMouseEnter: () => paint(index, true),
    onMouseLeave: () => paint(index, false)
});
// Constant-duration jump (eased), NOT native `behavior:'smooth'` — Chromium's
// smooth scroll animates proportional to distance, so jumping across a long
// thread crawls for seconds. A fixed ~260ms feels instant near or far. A
// shared rAF handle cancels a prior jump so rapid tick clicks don't fight.
let jumpRaf = 0;
function jumpScroll(viewport, top, duration = 170) {
    cancelAnimationFrame(jumpRaf);
    const start = viewport.scrollTop;
    const delta = top - start;
    if (Math.abs(delta) < 2) {
        viewport.scrollTop = top;
        return;
    }
    const t0 = performance.now();
    const ease = (t) => 1 - (1 - t) ** 3; // easeOutCubic
    const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        viewport.scrollTop = start + delta * ease(p);
        if (p < 1) {
            jumpRaf = requestAnimationFrame(step);
        }
    };
    jumpRaf = requestAnimationFrame(step);
}
function scrollToPrompt(id) {
    const viewport = document.querySelector(VIEWPORT);
    const node = viewport?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!viewport || !node) {
        return;
    }
    const top = viewport.scrollTop + (node.getBoundingClientRect().top - viewport.getBoundingClientRect().top) - 8;
    triggerHaptic('selection');
    jumpScroll(viewport, Math.max(0, top));
}
/** Right-edge prompt rail — hover previews, click to jump. ≥4 user turns only. */
export const ThreadTimeline = () => {
    const sourceSignature = useAuiState(s => {
        const rows = [];
        for (const message of s.thread.messages) {
            if (message.role !== 'user') {
                continue;
            }
            rows.push({ id: message.id, role: 'user', text: userPromptText(message.content) });
        }
        return JSON.stringify(rows);
    });
    const entries = useMemo(() => deriveTimelineEntries(JSON.parse(sourceSignature)), [sourceSignature]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [open, setOpen] = useState(false);
    const closeTimerRef = useRef(undefined);
    // Hover sync lives on the DOM, not in React state — the tick and its popover
    // row are siblings in different subtrees, so a shared index-keyed paint() lights
    // both without a re-render (and without coupling them through a parent atom).
    const tickRefs = useRef([]);
    const rowRefs = useRef([]);
    // Hover sync: light the tick + its popover row, and scroll that row into view
    // when the list overflows so the hovered prompt is always visible.
    const paint = useCallback((index, on) => {
        const tick = tickRefs.current[index];
        if (tick) {
            tick.style.opacity = on ? '1' : '';
        }
        const row = rowRefs.current[index];
        row?.classList.toggle('bg-(--ui-row-hover-background)', on);
        if (on) {
            row?.scrollIntoView({ block: 'nearest' });
        }
    }, []);
    const keepOpen = useCallback(() => {
        window.clearTimeout(closeTimerRef.current);
        setOpen(true);
    }, []);
    const closeSoon = useCallback(() => {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
    }, []);
    useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
    useEffect(() => {
        const viewport = document.querySelector(VIEWPORT);
        if (!viewport || entries.length === 0) {
            return;
        }
        let raf = 0;
        const compute = () => {
            raf = 0;
            const top = viewport.getBoundingClientRect().top;
            const offsets = entries.map(entry => {
                const node = viewport.querySelector(`[data-message-id="${CSS.escape(entry.id)}"]`);
                return node ? node.getBoundingClientRect().top - top : null;
            });
            const next = activeTimelineIndex(offsets);
            setActiveIndex(prev => (prev === next ? prev : next));
        };
        const onScroll = () => {
            if (!raf) {
                raf = requestAnimationFrame(compute);
            }
        };
        compute();
        viewport.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            viewport.removeEventListener('scroll', onScroll);
            if (raf) {
                cancelAnimationFrame(raf);
            }
        };
    }, [entries]);
    if (entries.length < MIN_ENTRIES) {
        return null;
    }
    return (_jsxs("div", { "aria-label": "Conversation timeline", className: "group/timeline pointer-events-auto absolute right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-end", "data-slot": "thread-timeline", "data-suppress-pane-reveal": "", onMouseEnter: keepOpen, onMouseLeave: closeSoon, role: "navigation", children: [_jsx(TimelineTicks, { activeIndex: activeIndex, entries: entries, onHover: paint, onJump: scrollToPrompt, tickRefs: tickRefs }), _jsx(TimelinePopover, { activeIndex: activeIndex, entries: entries, onHover: paint, onJump: scrollToPrompt, open: open, rowRefs: rowRefs })] }));
};
const TimelinePopover = ({ activeIndex, entries, onHover, onJump, open, rowRefs }) => (_jsx("div", { className: cn(POPOVER_SHELL, open ? 'pointer-events-auto opacity-100 translate-x-0' : 'pointer-events-none translate-x-1 opacity-0'), "data-slot": "thread-timeline-popover", children: entries.map((entry, index) => (_jsx("button", { "aria-label": entry.preview, className: cn(ROW_CLASS, index === activeIndex && 'bg-(--ui-row-active-background) text-foreground'), onClick: () => onJump(entry.id), ref: listRef(rowRefs, index), type: "button", ...hoverProps(index, onHover), children: _jsx("span", { className: "block w-full min-w-0 truncate font-medium leading-snug text-foreground", children: entry.preview }) }, entry.id))) }));
const TimelineTicks = ({ activeIndex, entries, onHover, onJump, tickRefs }) => (_jsx("div", { className: "flex flex-col items-end py-1", "data-slot": "thread-timeline-ticks", children: entries.map((entry, index) => (_jsx("button", { "aria-label": entry.preview, className: "flex h-2 w-7 cursor-pointer items-center justify-end pr-1", onClick: () => onJump(entry.id), type: "button", ...hoverProps(index, onHover), children: _jsx("span", { className: cn('block h-px w-3 transition-opacity duration-100 ease-out', index === activeIndex ? 'bg-(--theme-primary)' : 'dither text-(--ui-text-quaternary) opacity-70'), ref: listRef(tickRefs, index) }) }, entry.id))) }));
