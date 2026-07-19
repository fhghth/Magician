import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogTail } from '@/components/chat/log-tail';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ResponsiveTabs } from '@/components/ui/tab-dropdown';
import { getActionStatus, getLogs, getStatus, getUsageAnalytics, restartGateway, updateHermes } from '@/hermes';
import { useI18n } from '@/i18n';
import { sessionTitle } from '@/lib/chat-runtime';
import { compactNumber } from '@/lib/format';
import { Activity, AlertCircle, BarChart3, Bookmark, BookmarkFilled, Download, MessageCircle, Trash2, Wrench } from '@/lib/icons';
import { exportSession } from '@/lib/session-export';
import { fmtDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { upsertDesktopActionTask } from '@/store/activity';
import { $pinnedSessionIds, pinSession, unpinSession } from '@/store/layout';
import { $sessions, sessionPinId } from '@/store/session';
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey';
import { useRouteEnumParam } from '../hooks/use-route-enum-param';
import { OverlayMain, OverlayNav, OverlaySplitLayout } from '../overlays/overlay-split-layout';
import { OverlayView } from '../overlays/overlay-view';
import { MaintenancePanel } from './maintenance';
const SECTIONS = ['sessions', 'system', 'usage', 'maintenance'];
const LOG_FILES = ['agent', 'errors', 'gateway', 'desktop'];
const LOG_LEVELS = ['ALL', 'INFO', 'WARNING', 'ERROR'];
const USAGE_PERIODS = [7, 30, 90];
function formatTimestamp(value) {
    if (!value) {
        return '';
    }
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return fmtDateTime.format(date);
}
function useDebouncedValue(value, delayMs) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(id);
    }, [delayMs, value]);
    return debounced;
}
function RowIconButton({ children, className, onClick, title }) {
    return (_jsx(Button, { "aria-label": title, className: cn('text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground', className), onClick: onClick, size: "icon-xs", title: title, type: "button", variant: "ghost", children: children }));
}
function EmptyPanel({ action, description, title }) {
    return (_jsx("div", { className: "grid min-h-48 place-items-center px-6 text-center", children: _jsxs("div", { children: [title && (_jsx("div", { className: "text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: title })), _jsx("div", { className: "mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: description }), action && _jsx("div", { className: "mt-3 flex justify-center", children: action })] }) }));
}
export function CommandCenterView({ initialSection, onClose, onDeleteSession, onOpenSession }) {
    const { t } = useI18n();
    const cc = t.commandCenter;
    const sessions = useStore($sessions);
    const pinnedSessionIds = useStore($pinnedSessionIds);
    const [section, setSection] = useRouteEnumParam('section', SECTIONS, initialSection ?? 'sessions');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logFile, setLogFile] = useState('agent');
    const [logLevel, setLogLevel] = useState('ALL');
    const [logQuery, setLogQuery] = useState('');
    const [systemLoading, setSystemLoading] = useState(false);
    const [systemError, setSystemError] = useState('');
    const [systemAction, setSystemAction] = useState(null);
    const [usagePeriod, setUsagePeriod] = useState(30);
    const [usage, setUsage] = useState(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState('');
    const usageRequestRef = useRef(0);
    const debouncedQuery = useDebouncedValue(query.trim(), 180);
    const filteredSessions = useMemo(() => {
        const sorted = [...sessions].sort((a, b) => {
            const left = a.last_active || a.started_at || 0;
            const right = b.last_active || b.started_at || 0;
            return right - left;
        });
        const needle = debouncedQuery.toLowerCase();
        if (!needle) {
            return sorted;
        }
        return sorted.filter(session => {
            const haystack = `${sessionTitle(session)} ${session.id}`.toLowerCase();
            return haystack.includes(needle);
        });
    }, [debouncedQuery, sessions]);
    const refreshSystem = useCallback(async () => {
        setSystemLoading(true);
        setSystemError('');
        try {
            const [nextStatus, nextLogs] = await Promise.all([
                getStatus(),
                getLogs({
                    file: logFile,
                    level: logLevel,
                    lines: 200
                })
            ]);
            setStatus(nextStatus);
            setLogs(nextLogs.lines);
        }
        catch (error) {
            setSystemError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setSystemLoading(false);
        }
    }, [logFile, logLevel]);
    const refreshUsage = useCallback(async (days) => {
        const requestId = usageRequestRef.current + 1;
        usageRequestRef.current = requestId;
        setUsageLoading(true);
        setUsageError('');
        try {
            const response = await getUsageAnalytics(days);
            if (usageRequestRef.current === requestId) {
                setUsage(response);
            }
        }
        catch (error) {
            if (usageRequestRef.current === requestId) {
                setUsageError(error instanceof Error ? error.message : String(error));
            }
        }
        finally {
            if (usageRequestRef.current === requestId) {
                setUsageLoading(false);
            }
        }
    }, []);
    useEffect(() => {
        // Refetch when the panel opens and whenever the log file/level filters
        // change (refreshSystem's identity tracks them).
        if (section === 'system') {
            void refreshSystem();
        }
    }, [refreshSystem, section]);
    useEffect(() => {
        if (section === 'usage') {
            void refreshUsage(usagePeriod);
        }
    }, [refreshUsage, section, usagePeriod]);
    useRefreshHotkey(() => {
        if (section === 'system') {
            void refreshSystem();
        }
        else if (section === 'usage') {
            void refreshUsage(usagePeriod);
        }
    });
    const sessionListHasResults = filteredSessions.length > 0;
    // Client-side substring filter over the fetched tail (matches `hermes logs --search`).
    const visibleLogs = useMemo(() => {
        const needle = logQuery.trim().toLowerCase();
        if (!needle) {
            return logs;
        }
        return logs.filter(line => line.toLowerCase().includes(needle));
    }, [logQuery, logs]);
    const runSystemAction = useCallback(async (kind) => {
        setSystemError('');
        try {
            const started = kind === 'restart' ? await restartGateway() : await updateHermes();
            let nextStatus = null;
            for (let attempt = 0; attempt < 18; attempt += 1) {
                await new Promise(resolve => window.setTimeout(resolve, 1200));
                const polled = await getActionStatus(started.name, 180);
                nextStatus = polled;
                setSystemAction(polled);
                upsertDesktopActionTask(polled);
                if (!polled.running) {
                    break;
                }
            }
            if (!nextStatus) {
                const pendingStatus = {
                    exit_code: null,
                    lines: [cc.actionStartedWaiting],
                    name: started.name,
                    pid: started.pid,
                    running: true
                };
                setSystemAction(pendingStatus);
                upsertDesktopActionTask(pendingStatus);
            }
        }
        catch (error) {
            setSystemError(error instanceof Error ? error.message : String(error));
        }
        finally {
            void refreshSystem();
        }
    }, [cc, refreshSystem]);
    return (_jsx(OverlayView, { closeLabel: cc.close, onClose: onClose, children: _jsxs(OverlaySplitLayout, { children: [_jsx(OverlayNav, { groups: SECTIONS.map(value => ({
                        active: section === value,
                        icon: value === 'sessions'
                            ? MessageCircle
                            : value === 'system'
                                ? Activity
                                : value === 'maintenance'
                                    ? Wrench
                                    : BarChart3,
                        id: value,
                        label: cc.sections[value],
                        onSelect: () => setSection(value)
                    })) }), _jsxs(OverlayMain, { children: [_jsxs("header", { className: "mb-4 flex items-center justify-between gap-3 max-[47.5rem]:mb-2", children: [_jsxs("div", { className: "min-w-0 max-[47.5rem]:hidden", children: [_jsx("h2", { className: "text-[length:var(--conversation-text-font-size)] font-semibold text-foreground", children: cc.sections[section] }), _jsx("p", { className: "mt-0.5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: cc.sectionDescriptions[section] })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [section === 'sessions' && (_jsx(SearchField, { containerClassName: "max-w-[40vw]", onChange: next => setQuery(next), placeholder: cc.searchPlaceholder, value: query })), section === 'usage' && (_jsx(SegmentedControl, { onChange: id => setUsagePeriod(Number(id)), options: USAGE_PERIODS.map(value => ({ id: String(value), label: cc.days(value) })), value: String(usagePeriod) }))] })] }), section === 'sessions' ? (_jsx("div", { className: "min-h-0 flex-1 overflow-y-auto", children: !sessionListHasResults ? (_jsx(EmptyPanel, { description: debouncedQuery ? cc.noResults : cc.noSessions })) : (_jsx("ul", { children: filteredSessions.map(session => {
                                    const pinId = sessionPinId(session);
                                    const pinned = pinnedSessionIds.includes(pinId);
                                    return (_jsxs("li", { className: "group flex items-center gap-2 py-2", children: [_jsxs("button", { className: "min-w-0 flex-1 text-left", onClick: () => onOpenSession(session.id), type: "button", children: [_jsx("div", { className: "truncate text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: sessionTitle(session) }), _jsx("div", { className: "truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: formatTimestamp(session.last_active || session.started_at) })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", children: [_jsx(RowIconButton, { onClick: () => (pinned ? unpinSession(pinId) : pinSession(pinId)), title: pinned ? cc.unpinSession : cc.pinSession, children: pinned ? _jsx(BookmarkFilled, { className: "size-3.5" }) : _jsx(Bookmark, { className: "size-3.5" }) }), _jsx(RowIconButton, { onClick: () => void exportSession(session.id, { session, title: sessionTitle(session) }), title: cc.exportSession, children: _jsx(Download, { className: "size-3.5" }) }), _jsx(RowIconButton, { className: "hover:text-destructive", onClick: () => void onDeleteSession(session.id), title: cc.deleteSession, children: _jsx(Trash2, { className: "size-3.5" }) })] })] }, session.id));
                                }) })) })) : section === 'usage' ? (_jsx(UsagePanel, { error: usageError, loading: usageLoading, onRefresh: () => void refreshUsage(usagePeriod), period: usagePeriod, usage: usage })) : section === 'maintenance' ? (_jsx(MaintenancePanel, {})) : (_jsxs("div", { className: "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4", children: [_jsx("div", { children: status ? (_jsxs("div", { className: "grid gap-2", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 max-[47.5rem]:flex-col max-[47.5rem]:gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: cn('size-2 shrink-0 rounded-full', status.gateway_running ? 'bg-emerald-500' : 'bg-amber-500') }), _jsx("span", { className: "text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: status.gateway_running ? cc.gatewayRunning : cc.gatewayStopped })] }), _jsx("div", { className: "mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: cc.hermesActiveSessions(status.version, status.active_sessions) })] }), _jsxs("div", { className: "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap max-[47.5rem]:whitespace-normal", children: [_jsx(Button, { onClick: () => void runSystemAction('restart'), size: "xs", variant: "text", children: cc.restartGateway }), _jsx(Button, { onClick: () => void runSystemAction('update'), size: "xs", variant: "textStrong", children: cc.updateHermes })] })] }), systemAction && (_jsxs("div", { className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: [systemAction.name, " \u00B7", ' ', systemAction.running
                                                        ? cc.actionRunning
                                                        : systemAction.exit_code === 0
                                                            ? cc.actionDone
                                                            : cc.actionFailed] }))] })) : (_jsx(PageLoader, { className: "min-h-32", label: cc.loadingStatus })) }), _jsxs("div", { className: "flex min-h-0 flex-col pt-2", children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1", children: [_jsx("span", { className: "text-[0.625rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)", children: cc.recentLogs }), _jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [_jsx(ResponsiveTabs, { align: "end", onChange: id => setLogFile(id), tabs: LOG_FILES.map(value => ({ id: value, label: value })), value: logFile }), _jsx(ResponsiveTabs, { align: "end", onChange: id => setLogLevel(id), tabs: LOG_LEVELS.map(value => ({
                                                                id: value,
                                                                label: value === 'ALL' ? 'all' : value.toLowerCase()
                                                            })), value: logLevel }), _jsx(SearchField, { containerClassName: "w-44", onChange: next => setLogQuery(next), placeholder: cc.logSearchPlaceholder, value: logQuery })] }), systemError && (_jsxs("span", { className: "inline-flex items-center gap-1 text-[length:var(--conversation-caption-font-size)] text-destructive", children: [_jsx(AlertCircle, { className: "size-3.5" }), systemError] }))] }), _jsx(LogTail, { className: "flex-1 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary)", emptyLabel: cc.noLogs, lines: systemLoading && logs.length === 0 ? null : visibleLogs })] })] }))] })] }) }));
}
function UsagePanel({ error, loading, onRefresh, period, usage }) {
    const { t } = useI18n();
    const cc = t.commandCenter;
    const daily = useMemo(() => usage?.daily ?? [], [usage]);
    const totals = usage?.totals;
    const byModel = usage?.by_model ?? [];
    const topSkills = usage?.skills?.top_skills ?? [];
    const maxTokens = useMemo(() => {
        if (!daily.length) {
            return 1;
        }
        return daily.reduce((acc, entry) => Math.max(acc, (entry.input_tokens || 0) + (entry.output_tokens || 0)), 1);
    }, [daily]);
    if (!totals) {
        return (_jsx("div", { className: "min-h-0 flex-1", children: loading ? (_jsx(PageLoader, { className: "min-h-48", label: cc.loadingUsage })) : (_jsx(EmptyPanel, { action: _jsx(Button, { onClick: onRefresh, size: "xs", variant: "text", children: cc.retry }), description: cc.noUsage(period) })) }));
    }
    return (_jsxs("div", { className: "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-2", children: [error && (_jsxs("span", { className: "inline-flex items-center gap-1 text-[length:var(--conversation-caption-font-size)] text-destructive", children: [_jsx(AlertCircle, { className: "size-3.5" }), error] })), _jsxs("div", { className: "grid grid-cols-2 gap-x-4 gap-y-4 py-2 sm:grid-cols-3", children: [_jsx(UsageStat, { label: cc.statSessions, value: compactNumber(totals.total_sessions) }), _jsx(UsageStat, { label: cc.statApiCalls, value: compactNumber(totals.total_api_calls) }), _jsx(UsageStat, { label: cc.statTokens, value: `${compactNumber(totals.total_input)} / ${compactNumber(totals.total_output)}` })] }), _jsxs("section", { children: [_jsxs("div", { className: "mb-2 flex items-baseline justify-between", children: [_jsx("span", { className: "text-[0.625rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)", children: cc.dailyTokens }), _jsxs("span", { className: "flex items-center gap-3 text-[0.65rem] text-(--ui-text-tertiary)", children: [_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx("span", { className: "size-2 rounded-[1px] bg-[color:var(--dt-primary)]/60" }), " ", cc.input] }), _jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx("span", { className: "size-2 rounded-[1px] bg-emerald-500/70" }), " ", cc.output] })] })] }), daily.length === 0 ? (_jsx("div", { className: "grid h-24 place-items-center text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: cc.noDailyActivity })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex h-24 items-end gap-px", children: daily.map(entry => {
                                    const inputH = Math.round(((entry.input_tokens || 0) / maxTokens) * 96);
                                    const outputH = Math.round(((entry.output_tokens || 0) / maxTokens) * 96);
                                    return (_jsxs("div", { className: "group relative flex h-24 min-w-0 flex-1 flex-col justify-end", title: `${entry.day} · in ${compactNumber(entry.input_tokens)} · out ${compactNumber(entry.output_tokens)}`, children: [_jsx("div", { className: "w-full rounded-t-[1px] bg-[color:var(--dt-primary)]/50", style: { height: Math.max(inputH, entry.input_tokens > 0 ? 1 : 0) } }), _jsx("div", { className: "w-full bg-emerald-500/60", style: { height: Math.max(outputH, entry.output_tokens > 0 ? 1 : 0) } })] }, entry.day));
                                }) }), _jsxs("div", { className: "mt-1 flex justify-between text-[0.6rem] text-(--ui-text-tertiary)", children: [_jsx("span", { children: daily[0]?.day }), _jsx("span", { children: daily[daily.length - 1]?.day })] })] }))] }), _jsxs("div", { className: "grid min-h-0 gap-x-8 gap-y-5 pt-1 sm:grid-cols-2", children: [_jsx(UsageList, { emptyLabel: cc.noModelUsage, rows: byModel.slice(0, 6).map(entry => ({
                            key: entry.model,
                            label: entry.model,
                            value: `${compactNumber((entry.input_tokens || 0) + (entry.output_tokens || 0))}`
                        })), title: cc.topModels }), _jsx(UsageList, { emptyLabel: cc.noSkillActivity, rows: topSkills.slice(0, 6).map(entry => ({
                            key: entry.skill,
                            label: entry.skill,
                            value: cc.actions(compactNumber(entry.total_count))
                        })), title: cc.topSkills })] })] }));
}
function UsageList({ emptyLabel, rows, title }) {
    return (_jsxs("section", { className: "min-w-0", children: [_jsx("div", { className: "mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)", children: title }), rows.length === 0 ? (_jsx("div", { className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: emptyLabel })) : (_jsx("ul", { children: rows.map(row => (_jsxs("li", { className: "flex items-center justify-between gap-2 py-1.5", children: [_jsx("span", { className: "min-w-0 truncate font-mono text-[0.7rem] text-foreground", children: row.label }), _jsx("span", { className: "shrink-0 text-[0.65rem] text-(--ui-text-tertiary)", children: row.value })] }, row.key))) }))] }));
}
function UsageStat({ hint, label, value }) {
    return (_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[0.625rem] font-medium uppercase tracking-[0.12em] text-(--ui-text-tertiary)", children: label }), _jsx("div", { className: "mt-1 truncate text-base font-semibold tracking-tight text-foreground", children: value }), hint && _jsx("div", { className: "mt-0.5 truncate text-[0.62rem] text-(--ui-text-tertiary)", children: hint })] }));
}
