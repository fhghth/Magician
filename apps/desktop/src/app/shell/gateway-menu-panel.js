import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { LogView } from '@/components/ui/log-view';
import { Tip } from '@/components/ui/tooltip';
import { getLogs } from '@/hermes';
import { useI18n } from '@/i18n';
import { LayoutDashboard, RefreshCw } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { runGatewayRestart } from '@/store/system-actions';
const LOG_TAIL = 120;
const LOG_VISIBLE = 40;
const LOG_POLL_MS = 3_000;
// Per-connection WebSocket churn (accept/close/heartbeat) drowns out anything
// useful — strip it so the tail reads as real gateway activity at a glance.
const LOG_NOISE_RE = /\bws (?:accepted|closed|response sent|ping|pong)\b/i;
// Live tail while the popover is mounted (i.e. open): poll on a tight cadence
// and stop on unmount, instead of a global always-on status poll.
function useGatewayLogTail() {
    const [lines, setLines] = useState([]);
    useEffect(() => {
        let cancelled = false;
        const load = () => getLogs({ file: 'gui', lines: LOG_TAIL })
            .then(res => {
            if (cancelled) {
                return;
            }
            setLines(res.lines
                .map(line => line.trim())
                .filter(line => line && !LOG_NOISE_RE.test(line))
                .slice(-LOG_VISIBLE));
        })
            .catch(() => { });
        void load();
        const timer = window.setInterval(load, LOG_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);
    return lines;
}
const PLATFORM_TONE = {
    connected: 'good',
    connecting: 'warn',
    retrying: 'warn',
    pending_restart: 'warn',
    startup_failed: 'bad',
    fatal: 'bad'
};
const prettyState = (state) => state.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
// Strip leading "YYYY-MM-DD HH:MM:SS,mmm " and "[runtime_id] " prefixes from
// log lines so they don't dominate the display. Full text preserved on hover.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}[,.\d]*\s+/;
const RUNTIME_BRACKET_RE = /^\[[^\]]+]\s+/;
const trimLogLine = (raw) => raw.trim().replace(TIMESTAMP_RE, '').replace(RUNTIME_BRACKET_RE, '');
export function GatewayMenuPanel({ gatewayState, inferenceStatus, onClose, onOpenSystem, statusSnapshot }) {
    const { t } = useI18n();
    const copy = t.shell.gatewayMenu;
    // Both jumps open the system panel, which owns the full view — so dismiss the
    // little status popover on the way out.
    const openSystem = () => {
        onClose();
        onOpenSystem();
    };
    // Shared restart helper: never rejects and surfaces progress in the statusbar
    // gateway indicator, so just fire and close.
    const restart = () => {
        onClose();
        void runGatewayRestart();
    };
    const gatewayOpen = gatewayState === 'open';
    const gatewayConnecting = gatewayState === 'connecting';
    const inferenceReady = gatewayOpen && inferenceStatus?.ready === true;
    const connectionLabel = gatewayOpen
        ? copy.connected
        : gatewayConnecting
            ? copy.connecting
            : prettyState(gatewayState || copy.offline);
    const inferenceLabel = gatewayOpen
        ? inferenceStatus?.ready
            ? copy.inferenceReady
            : inferenceStatus
                ? copy.inferenceNotReady
                : copy.checkingInference
        : copy.disconnected;
    const platforms = Object.entries(statusSnapshot?.gateway_platforms || {}).sort(([l], [r]) => l.localeCompare(r));
    const recentLogs = useGatewayLogTail();
    // Keep the tail pinned to the latest line as it streams.
    const logScrollRef = useRef(null);
    useEffect(() => {
        const el = logScrollRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [recentLogs]);
    return (_jsxs("div", { className: "text-sm", children: [_jsxs("div", { className: "flex items-center justify-between gap-3 px-3 py-2", children: [_jsxs("div", { className: "flex min-w-0 flex-col gap-1 text-[0.7rem] leading-none", children: [_jsxs("span", { className: "flex items-center gap-1.5 font-medium", children: [_jsx(StatusDot, { tone: gatewayOpen ? 'good' : gatewayConnecting ? 'warn' : 'bad' }), connectionLabel] }), _jsxs("span", { className: "flex items-center gap-1.5 text-muted-foreground", children: [_jsx(StatusDot, { tone: inferenceReady ? 'good' : gatewayOpen ? 'warn' : 'bad' }), inferenceLabel] })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-0.5", children: [_jsx(Tip, { label: t.commandCenter.restartGateway, children: _jsx(Button, { "aria-label": t.commandCenter.restartGateway, className: "text-muted-foreground hover:text-foreground", onClick: restart, size: "icon-xs", variant: "ghost", children: _jsx(RefreshCw, {}) }) }), _jsx(Tip, { label: copy.openSystem, children: _jsx(Button, { "aria-label": copy.openSystem, className: "text-muted-foreground hover:text-foreground", onClick: openSystem, size: "icon-xs", variant: "ghost", children: _jsx(LayoutDashboard, {}) }) })] })] }), inferenceStatus?.reason && (_jsx(Section, { className: "text-xs text-muted-foreground", children: _jsx("div", { className: "line-clamp-3", children: inferenceStatus.reason }) })), recentLogs.length > 0 && (_jsxs(Section, { children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx(SectionLabel, { children: copy.recentActivity }), _jsx(Button, { className: "-mr-2 h-auto py-0 font-medium leading-none text-muted-foreground", onClick: openSystem, size: "xs", type: "button", variant: "text", children: copy.viewAllLogs })] }), _jsx(LogView, { className: "mt-1.5 max-h-40 border-0 px-0", ref: logScrollRef, children: recentLogs.map(trimLogLine).join('\n') })] })), platforms.length > 0 && (_jsxs(Section, { children: [_jsx(SectionLabel, { children: copy.messagingPlatforms }), _jsx("ul", { className: "mt-1.5 space-y-1", children: platforms.map(([name, platform]) => (_jsxs("li", { className: "flex items-center justify-between gap-2 text-xs", children: [_jsx("span", { className: "truncate capitalize", children: name }), _jsxs("span", { className: "flex items-center gap-1.5 text-[0.66rem] text-muted-foreground", children: [_jsx(StatusDot, { tone: PLATFORM_TONE[platform.state] || 'muted' }), prettyState(platform.state)] })] }, name))) })] }))] }));
}
function Section({ children, className }) {
    return _jsx("div", { className: cn('border-t border-border/50 px-3 py-2', className), children: children });
}
function SectionLabel({ children }) {
    return (_jsx("div", { className: "text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80", children: children }));
}
