import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sessionTitle } from '@/lib/chat-runtime';
import { cn } from '@/lib/utils';
import { $attentionSessionIds, $workingSessionIds } from '@/store/session';
import { $switcherIndex, $switcherOpen, $switcherSessions, closeSwitcher } from '@/store/session-switcher';
import { HUD_ITEM, HUD_POSITION, HUD_SURFACE, HUD_TEXT } from './floating-hud';
import { sessionRoute } from './routes';
// Compact session-switcher HUD — keyboard-driven from `use-keybinds`, rows
// clickable via mousedown (Ctrl+click on macOS). No Dialog: Tab stays global.
export function SessionSwitcher() {
    const open = useStore($switcherOpen);
    const sessions = useStore($switcherSessions);
    const index = useStore($switcherIndex);
    const working = useStore($workingSessionIds);
    const attention = useStore($attentionSessionIds);
    const navigate = useNavigate();
    const activeRef = useRef(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [index, open]);
    if (!open || sessions.length === 0) {
        return null;
    }
    const workingIds = new Set(working);
    const attentionIds = new Set(attention);
    const pick = (sessionId) => {
        closeSwitcher();
        navigate(sessionRoute(sessionId));
    };
    return createPortal(_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-[219]", onMouseDown: e => {
                    e.preventDefault();
                    closeSwitcher();
                } }), _jsx("div", { className: cn(HUD_POSITION, HUD_SURFACE, 'dt-portal-scrollbar z-[220] max-h-[min(22rem,64vh)] w-[min(19rem,calc(100vw-2rem))] select-none overflow-y-auto p-1'), children: sessions.map((session, i) => {
                    const selected = i === index;
                    return (_jsxs("div", { className: cn('row-hover flex items-center rounded leading-tight', HUD_ITEM, HUD_TEXT, selected ? 'bg-accent text-accent-foreground' : 'text-(--ui-text-secondary)'), onMouseDown: e => {
                            e.preventDefault();
                            pick(session.id);
                        }, ref: selected ? activeRef : undefined, children: [_jsx(SwitcherDot, { attention: attentionIds.has(session.id), working: workingIds.has(session.id) }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: sessionTitle(session) }), i < 9 && (_jsxs("span", { className: cn('shrink-0 font-mono text-[0.625rem] tabular-nums', selected ? 'text-accent-foreground/70' : 'text-(--ui-text-quaternary)'), children: ["\u2303", i + 1] }))] }, session.id));
                }) })] }), document.body);
}
function SwitcherDot({ attention, working }) {
    return (_jsx("span", { className: cn('size-1 shrink-0 rounded-full', attention ? 'bg-amber-400' : working ? 'animate-pulse bg-(--ui-accent)' : 'bg-(--ui-text-quaternary)/50') }));
}
