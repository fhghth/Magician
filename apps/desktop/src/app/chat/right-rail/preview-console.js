import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef } from 'react';
import { requestComposerInsert } from '@/app/chat/composer/focus';
import { CopyButton } from '@/components/ui/copy-button';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { PanelBottom, Send, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { notify } from '@/store/notifications';
const consoleLevelLabel = {
    0: 'log',
    1: 'info',
    2: 'warn',
    3: 'error'
};
const consoleLevelClass = {
    0: 'text-foreground',
    1: 'text-sky-700 dark:text-sky-300',
    2: 'text-amber-700 dark:text-amber-300',
    3: 'text-destructive'
};
const CONSOLE_BOTTOM_THRESHOLD = 24;
const CONSOLE_HEADER_HEIGHT = 32;
export function compactUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol === 'file:') {
            return decodeURIComponent(url.pathname);
        }
        return `${url.host}${url.pathname}${url.search}`;
    }
    catch {
        return value;
    }
}
export function formatLogLine(log) {
    const head = `[${consoleLevelLabel[log.level] || 'log'}]`;
    const tail = log.source ? ` (${compactUrl(log.source)}${log.line ? `:${log.line}` : ''})` : '';
    return `${head} ${log.message}${tail}`.trim();
}
export function formatConsoleEntries(entries) {
    return entries.map(formatLogLine).join('\n');
}
export function isNearConsoleBottom(element) {
    if (!element) {
        return true;
    }
    return element.scrollHeight - element.scrollTop - element.clientHeight <= CONSOLE_BOTTOM_THRESHOLD;
}
export function clampConsoleHeight(value) {
    return Math.max(value, CONSOLE_HEADER_HEIGHT);
}
function ConsoleRow({ copyText, log, onSend, onToggleSelect, selected }) {
    const { t } = useI18n();
    const copy = t.preview.console;
    return (_jsxs("div", { className: cn('group/row grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-transparent px-1 py-1 transition-colors hover:bg-accent/40', selected && 'border-border/60 bg-accent/40'), children: [_jsx(Tip, { label: selected ? copy.deselect : copy.select, children: _jsx("button", { className: cn('mt-0.5 text-left uppercase opacity-70 transition-colors hover:opacity-100', consoleLevelClass[log.level] ?? consoleLevelClass[0]), onClick: onToggleSelect, type: "button", children: consoleLevelLabel[log.level] || 'log' }) }), _jsxs("div", { className: "min-w-0", "data-selectable-text": "true", children: [_jsx("span", { className: cn('block wrap-break-word', consoleLevelClass[log.level] ?? consoleLevelClass[0]), children: log.message }), log.source && (_jsxs("span", { className: "block truncate text-muted-foreground/60", children: [compactUrl(log.source), log.line ? `:${log.line}` : ''] }))] }), _jsxs("span", { className: "opacity-0 transition-opacity group-hover/row:opacity-100", children: [_jsx(CopyButton, { appearance: "inline", className: "rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", errorMessage: copy.copyFailed, iconClassName: "size-3", label: copy.copyEntry, showLabel: false, text: copyText }), _jsx(Tip, { label: copy.sendEntry, children: _jsx("button", { className: "rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", onClick: onSend, type: "button", children: _jsx(Send, { className: "size-3" }) }) })] })] }));
}
export function PreviewConsoleTitlebarIcon({ consoleState }) {
    const { t } = useI18n();
    const logCount = useStore(consoleState.$logCount);
    return (_jsxs(_Fragment, { children: [_jsx(PanelBottom, {}), logCount > 0 && _jsx("span", { className: "sr-only", children: t.preview.console.messages(logCount) })] }));
}
export function PreviewConsolePanel({ consoleBodyRef, consoleShouldStickRef, consoleState, startConsoleResize }) {
    const { t } = useI18n();
    const copy = t.preview.console;
    const consoleHeight = useStore(consoleState.$height);
    const logs = useStore(consoleState.$logs);
    const selectedLogIds = useStore(consoleState.$selectedLogIds);
    const visibleSelection = useMemo(() => logs.filter(log => selectedLogIds.has(log.id)), [logs, selectedLogIds]);
    const sendableLogs = visibleSelection.length > 0 ? visibleSelection : logs;
    const stickScrollRafRef = useRef(null);
    useEffect(() => {
        if (!consoleShouldStickRef.current) {
            return;
        }
        if (stickScrollRafRef.current !== null) {
            window.cancelAnimationFrame(stickScrollRafRef.current);
            stickScrollRafRef.current = null;
        }
        stickScrollRafRef.current = window.requestAnimationFrame(() => {
            stickScrollRafRef.current = null;
            const consoleBody = consoleBodyRef.current;
            consoleBody?.scrollTo({ top: consoleBody.scrollHeight });
        });
        return () => {
            if (stickScrollRafRef.current !== null) {
                window.cancelAnimationFrame(stickScrollRafRef.current);
                stickScrollRafRef.current = null;
            }
        };
    }, [consoleBodyRef, consoleHeight, consoleShouldStickRef, logs]);
    function sendLogsToComposer(entries) {
        if (!entries.length) {
            return;
        }
        const block = [copy.promptHeader, '```', ...entries.map(formatLogLine), '```'].join('\n');
        requestComposerInsert(block, { mode: 'block', target: 'main' });
        consoleState.clearSelection();
        notify({
            kind: 'success',
            title: copy.sentTitle,
            message: copy.sentMessage(entries.length)
        });
    }
    return (_jsxs("div", { className: "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-(--preview-console-height) min-h-8 flex-col overflow-hidden border-t border-border/60 bg-background", style: { '--preview-console-height': `${consoleHeight}px` }, children: [_jsx("div", { "aria-label": copy.resize, className: "group absolute inset-x-0 -top-1 z-1 h-2 cursor-row-resize", onDoubleClick: () => consoleState.setHeight(CONSOLE_HEADER_HEIGHT), onPointerDown: startConsoleResize, role: "separator", children: _jsx("span", { className: "absolute left-1/2 top-1/2 h-0.75 w-23 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/80 opacity-0 transition-opacity duration-100 group-hover:opacity-[0.5]" }) }), _jsxs("div", { className: "flex h-8 shrink-0 items-center justify-between border-b border-border/50 px-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-[0.6875rem] font-medium text-muted-foreground", children: [_jsx(PanelBottom, { className: "size-3.5" }), copy.title, selectedLogIds.size > 0 && (_jsx("span", { className: "rounded-full bg-muted px-1.5 py-px text-[0.5625rem] text-muted-foreground", children: copy.selected(selectedLogIds.size) }))] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs("button", { className: "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40", disabled: sendableLogs.length === 0, onClick: () => sendLogsToComposer(sendableLogs), type: "button", children: [_jsx(Send, { className: "size-3" }), copy.sendToChat] }), _jsx(CopyButton, { appearance: "inline", className: "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40", disabled: sendableLogs.length === 0, errorMessage: copy.copyFailed, iconClassName: "size-3", label: visibleSelection.length > 0 ? copy.copySelected : copy.copyAll, text: () => formatConsoleEntries(sendableLogs), children: copy.copy }), _jsxs("button", { className: "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40", disabled: logs.length === 0, onClick: consoleState.clear, type: "button", children: [_jsx(Trash2, { className: "size-3" }), copy.clear] })] })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-2 py-1.5 font-mono text-[0.6875rem] leading-relaxed", ref: consoleBodyRef, children: logs.length > 0 ? (logs.map(log => {
                    const selected = selectedLogIds.has(log.id);
                    return (_jsx(ConsoleRow, { copyText: formatLogLine(log), log: log, onSend: () => sendLogsToComposer([log]), onToggleSelect: () => consoleState.toggleSelection(log.id), selected: selected }, log.id));
                })) : (_jsx("div", { className: "py-2 text-muted-foreground/70", children: copy.empty })) })] }));
}
