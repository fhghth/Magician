import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { ErrorIcon } from '@/components/ui/error-state';
import { Loader } from '@/components/ui/loader';
import { LogView } from '@/components/ui/log-view';
import { useI18n } from '@/i18n';
import { ChevronDown, ChevronRight, iconSize } from '@/lib/icons';
import { capitalize } from '@/lib/text';
import { cn } from '@/lib/utils';
function formatStageName(name) {
    // 'system-packages' -> 'System packages'; 'uv' stays 'uv'
    if (name.length <= 3) {
        return name;
    }
    return name
        .split('-')
        .map((word, i) => (i === 0 ? capitalize(word) : word))
        .join(' ');
}
function formatDuration(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) {
        return '';
    }
    if (ms < 1000) {
        return `${ms} ms`;
    }
    const s = ms / 1000;
    if (s < 60) {
        return `${s.toFixed(1)}s`;
    }
    const m = Math.floor(s / 60);
    const rs = Math.round(s - m * 60);
    return `${m}m ${rs}s`;
}
// Live elapsed for a running stage, as m:ss (or s for sub-minute).
function formatElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) {
        return `${s}s`;
    }
    const m = Math.floor(s / 60);
    return `${m}:${String(s - m * 60).padStart(2, '0')}`;
}
function StageRow({ descriptor, result, now }) {
    const { t } = useI18n();
    const copy = t.install;
    const state = result?.state || 'pending';
    const elapsed = state === 'running' && typeof result?.startedAt === 'number' ? formatElapsed(now - result.startedAt) : '';
    const icon = useMemo(() => {
        switch (state) {
            case 'running':
                return _jsx(Loader, { className: "size-6", type: "fourier-flow" });
            case 'succeeded':
            case 'skipped':
                return _jsx(Codicon, { className: "text-muted-foreground", name: "check", size: "0.8125rem" });
            case 'failed':
                return _jsx(ErrorIcon, { size: "1rem" });
            case 'pending':
            default:
                return _jsx("div", { className: "size-1.5 rounded-full border border-(--ui-stroke-secondary)" });
        }
    }, [state]);
    const reason = result?.json?.reason || result?.error || null;
    return (_jsxs("li", { className: "flex items-center gap-3 px-3 py-1", children: [state === 'running' && (_jsx("div", { className: "-mr-2 -ml-4 flex size-6 flex-shrink-0 items-center justify-center", children: icon })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: cn('truncate text-sm', state === 'running' ? 'font-medium' : 'text-muted-foreground'), children: formatStageName(descriptor.name) }), state !== 'running' && _jsx("span", { className: "flex size-4 shrink-0 items-center justify-center", children: icon })] }), reason && state !== 'pending' && _jsx("p", { className: "mt-0.5 truncate text-xs text-muted-foreground", children: reason })] }), _jsxs("span", { className: "flex-shrink-0 text-xs tabular-nums text-muted-foreground", children: [state === 'running' ? (elapsed ? `${copy.stageStates[state]} · ${elapsed}` : copy.stageStates[state]) : null, state === 'succeeded' || state === 'skipped' ? formatDuration(result?.durationMs) : null, state === 'failed' ? copy.stageStates[state] : null] })] }));
}
const EMPTY_STATE = {
    active: false,
    manifest: null,
    stages: {},
    error: null,
    log: [],
    startedAt: null,
    completedAt: null,
    unsupportedPlatform: null
};
function applyEvent(state, ev) {
    if (ev.type === 'manifest') {
        const stages = {};
        for (const stage of ev.stages) {
            stages[stage.name] = { state: 'pending', durationMs: null, startedAt: null, json: null, error: null };
        }
        return {
            ...state,
            active: true,
            manifest: { type: 'manifest', stages: ev.stages, protocolVersion: ev.protocolVersion },
            stages,
            error: null,
            startedAt: state.startedAt || Date.now()
        };
    }
    if (ev.type === 'stage') {
        const prev = state.stages[ev.name];
        return {
            ...state,
            stages: {
                ...state.stages,
                [ev.name]: {
                    state: ev.state,
                    durationMs: ev.durationMs ?? null,
                    // Stamp the start time on the running transition so the UI can show
                    // a live elapsed timer; preserve it across repeated running events.
                    startedAt: ev.state === 'running' ? (prev?.startedAt ?? Date.now()) : (prev?.startedAt ?? null),
                    json: ev.json ?? null,
                    error: ev.error ?? null
                }
            }
        };
    }
    if (ev.type === 'log') {
        const next = state.log.concat({ ts: Date.now(), stage: ev.stage ?? null, line: ev.line, stream: ev.stream });
        while (next.length > 500) {
            next.shift();
        }
        return { ...state, log: next };
    }
    if (ev.type === 'complete') {
        return { ...state, active: false, completedAt: Date.now(), error: null };
    }
    if (ev.type === 'failed') {
        return { ...state, active: false, error: ev.error || 'unknown error' };
    }
    if (ev.type === 'unsupported-platform') {
        return {
            ...state,
            active: false,
            unsupportedPlatform: {
                platform: ev.platform,
                activeRoot: ev.activeRoot,
                installCommand: ev.installCommand,
                docsUrl: ev.docsUrl
            }
        };
    }
    return state;
}
export function DesktopInstallOverlay({ enabled = true }) {
    const { t } = useI18n();
    const copy = t.install;
    const [state, setState] = useState(EMPTY_STATE);
    const [logOpen, setLogOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const logEndRef = useRef(null);
    // Tick once a second while a bootstrap is in flight so running steps show a
    // live elapsed timer. Stops when nothing is active to avoid idle renders.
    useEffect(() => {
        if (!state.active) {
            return;
        }
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [state.active]);
    // Subscribe to bootstrap events + load initial snapshot
    useEffect(() => {
        if (!enabled) {
            return;
        }
        const desktop = window.hermesDesktop;
        if (!desktop || typeof desktop.onBootstrapEvent !== 'function') {
            return;
        }
        let cancelled = false;
        desktop
            .getBootstrapState()
            .then(snapshot => {
            if (!cancelled && snapshot) {
                setState(snapshot);
            }
        })
            .catch(() => {
            // Older Electron build without the IPC handler -- bootstrap UI just
            // stays empty, app falls through to existing onboarding flow.
        });
        const off = desktop.onBootstrapEvent(ev => setState(prev => applyEvent(prev, ev)));
        return () => {
            cancelled = true;
            off?.();
        };
    }, [enabled]);
    // Autoscroll log to bottom when new lines arrive AND the log is open
    useEffect(() => {
        if (logOpen && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
    }, [state.log.length, logOpen]);
    // Auto-expand the log panel when a bootstrap fails so the user immediately
    // sees the install.ps1 output. Without this, the failure block shows just
    // the top-level error message and the user has to click "Show installer
    // output" to see WHY the stage failed.
    useEffect(() => {
        if (state.error) {
            setLogOpen(true);
        }
    }, [state.error]);
    // Mount logic: show whenever a bootstrap is in flight, completed-with-error,
    // or actively running with a manifest. Hide entirely after a successful
    // completion so the rest of the UI can take over.
    const shouldShow = useMemo(() => {
        if (!enabled) {
            return false;
        }
        if (state.active) {
            return true;
        }
        if (state.error) {
            return true;
        }
        if (state.unsupportedPlatform) {
            return true;
        }
        return false;
    }, [enabled, state.active, state.error, state.unsupportedPlatform]);
    if (!shouldShow) {
        return null;
    }
    // Unsupported-platform branch: macOS/Linux packaged builds hit this when
    // there's no Hermes Agent installed yet and we can't drive install.sh
    // (no stage protocol equivalent yet). Show a copy-paste install command
    // and the docs URL; user runs it from Terminal and relaunches the app.
    if (state.unsupportedPlatform) {
        const ups = state.unsupportedPlatform;
        const platformLabel = ups.platform === 'darwin' ? 'macOS' : ups.platform === 'linux' ? 'Linux' : ups.platform;
        return (_jsx("div", { className: "fixed inset-0 z-[1400] flex items-center justify-center bg-background/90 backdrop-blur-md", children: _jsxs("div", { className: "w-full max-w-xl rounded-xl border border-(--stroke-nous) bg-card p-8 shadow-nous", children: [_jsx("h2", { className: "text-xl font-semibold tracking-tight", children: copy.oneTimeTitle }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: copy.unsupportedDesc(platformLabel) }), _jsxs("div", { className: "mt-4", children: [_jsx("div", { className: "mb-1.5 text-xs font-medium text-muted-foreground", children: copy.installCommand }), _jsx("pre", { className: "overflow-x-auto rounded-md border border-(--stroke-nous) px-3 py-2.5 font-mono text-[12px]", children: _jsx("code", { children: ups.installCommand }) }), _jsxs("div", { className: "mt-2 flex items-center gap-2", children: [_jsx(Button, { onClick: () => {
                                            void navigator.clipboard?.writeText(ups.installCommand).catch(() => { });
                                        }, size: "sm", variant: "secondary", children: copy.copyCommand }), _jsx(Button, { onClick: () => {
                                            window.hermesDesktop?.openExternal?.(ups.docsUrl);
                                        }, size: "sm", variant: "ghost", children: copy.viewDocs })] })] }), _jsxs("div", { className: "mt-6 flex items-center justify-between pt-2", children: [_jsxs("span", { className: "text-xs text-muted-foreground", children: [copy.installTo, " ", _jsx("code", { className: "font-mono text-(--ui-text-secondary)", children: ups.activeRoot })] }), _jsx(Button, { onClick: () => window.location.reload(), size: "sm", variant: "default", children: copy.retryAfterRun })] })] }) }));
    }
    const stages = state.manifest?.stages || [];
    const currentStage = stages.find(s => state.stages[s.name]?.state === 'running')?.name;
    const completedCount = stages.filter(s => state.stages[s.name]?.state === 'succeeded' || state.stages[s.name]?.state === 'skipped').length;
    const totalCount = stages.length;
    const failed = Boolean(state.error);
    // Count the running stage as half-done so the bar advances *during* a long
    // stage instead of sitting frozen at the last completed step while its logs
    // stream (e.g. "0 of 2" pinned at 0% for the whole first stage).
    const progressUnits = completedCount + (!failed && currentStage ? 0.5 : 0);
    const progressPct = totalCount > 0 ? Math.round((progressUnits / totalCount) * 100) : 0;
    const currentStartedAt = currentStage ? state.stages[currentStage]?.startedAt : null;
    const currentElapsed = typeof currentStartedAt === 'number' ? formatElapsed(now - currentStartedAt) : '';
    return (_jsx("div", { className: "fixed inset-0 z-[1400] flex items-center justify-center bg-background/90 backdrop-blur-md p-4", children: _jsxs("div", { className: "flex w-full max-w-2xl max-h-[90vh] flex-col rounded-xl border border-(--stroke-nous) bg-card shadow-nous", children: [_jsxs("div", { className: "flex flex-shrink-0 items-start gap-4 p-8 pb-4", children: [!failed && _jsx(BrandMark, { className: "size-11 shrink-0" }), _jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-xl font-semibold tracking-tight", children: failed ? copy.failedTitle : state.active ? copy.settingUpTitle : copy.finishingTitle }), _jsx("p", { className: "mt-1.5 text-sm text-muted-foreground", children: failed ? copy.failedDesc : copy.activeDesc })] })] }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-8 pb-2", children: [totalCount > 0 && (_jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "mb-1 flex items-center justify-between text-xs text-muted-foreground", children: [_jsxs("span", { children: [copy.progress(completedCount, totalCount), currentStage && copy.currentStage(formatStageName(currentStage)), currentElapsed && ` (${currentElapsed})`] }), _jsxs("span", { className: "tabular-nums", children: [progressPct, "%"] })] }), _jsx("div", { className: "h-1.5 w-full overflow-hidden rounded-full bg-(--ui-bg-tertiary)", children: _jsx("div", { className: cn('h-full transition-all duration-300', failed ? 'bg-destructive' : 'bg-primary'), style: { width: `${progressPct}%` } }) })] })), totalCount === 0 && state.active && (_jsxs("div", { className: "mb-4 flex items-center gap-2.5 text-sm text-muted-foreground", children: [_jsx(Loader, { className: "size-5", type: "fourier-flow" }), _jsx("span", { children: copy.fetchingManifest })] })), failed && state.error && (_jsxs("div", { className: "mb-4 flex items-start gap-2 text-sm", children: [_jsx(ErrorIcon, { className: "mt-0.5 shrink-0", size: "1rem" }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "font-medium text-destructive", children: copy.error }), _jsx("p", { className: "mt-0.5 whitespace-pre-wrap break-words text-foreground/90", children: state.error })] })] })), stages.length > 0 && (_jsx("ol", { className: "mb-4 space-y-0.5", children: stages.map(stage => (_jsx(StageRow, { descriptor: stage, now: now, result: state.stages[stage.name] }, stage.name))) })), _jsxs("div", { className: "pt-3", children: [_jsxs(Button, { className: "-ml-2 text-muted-foreground hover:text-foreground", onClick: () => setLogOpen(v => !v), size: "xs", type: "button", variant: "ghost", children: [logOpen ? _jsx(ChevronDown, { className: iconSize.sm }) : _jsx(ChevronRight, { className: iconSize.sm }), _jsx("span", { children: logOpen ? copy.hideOutput : copy.showOutput }), _jsxs("span", { className: "ml-1 tabular-nums", children: ["(", copy.lines(state.log.length), ")"] })] }), logOpen && (_jsx(LogView, { className: cn('mt-2', failed ? 'max-h-96' : 'max-h-64'), children: state.log.length === 0 ? (_jsx("div", { children: copy.noOutput })) : (_jsxs(_Fragment, { children: [state.log.map((entry, i) => (_jsxs("div", { className: cn(entry.stream === 'stderr' && 'text-muted-foreground/70'), children: [entry.stage ? _jsxs("span", { className: "text-muted-foreground/60", children: ["[", entry.stage, "] "] }) : null, _jsx("span", { children: entry.line })] }, i))), _jsx("div", { ref: logEndRef })] })) }))] })] }), state.active && !failed && (_jsx("div", { className: "flex-shrink-0 bg-card p-4", children: _jsx("div", { className: "flex items-center justify-end", children: _jsxs(Button, { disabled: cancelling, onClick: async () => {
                                setCancelling(true);
                                try {
                                    await window.hermesDesktop?.cancelBootstrap?.();
                                }
                                catch {
                                    // ignore -- the failed/cancelled event will surface the result
                                }
                            }, size: "sm", variant: "ghost", children: [cancelling ? _jsx(Loader, { className: "size-4", type: "fourier-flow" }) : null, cancelling ? copy.cancelling : copy.cancelInstall] }) }) })), failed && (_jsx("div", { className: "flex-shrink-0 bg-card p-4", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: "text-xs text-muted-foreground", children: [copy.transcriptSaved, ' ', _jsx("code", { className: "font-mono text-(--ui-text-secondary)", children: "%LOCALAPPDATA%\\hermes\\logs\\" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { onClick: async () => {
                                            const text = state.log
                                                .map(entry => (entry.stage ? `[${entry.stage}] ${entry.line}` : entry.line))
                                                .join('\n');
                                            const fullText = state.error ? `Error: ${state.error}\n\n${text}` : text;
                                            try {
                                                await navigator.clipboard.writeText(fullText);
                                                setCopied(true);
                                                window.setTimeout(() => setCopied(false), 1500);
                                            }
                                            catch {
                                                // ignore -- some environments forbid clipboard writes
                                            }
                                        }, size: "sm", variant: "secondary", children: copied ? copy.copiedOutput : copy.copyOutput }), _jsx(Button, { onClick: async () => {
                                            // Tell main.ts to clear its latched failure BEFORE we
                                            // reload. Otherwise the renderer reload calls getConnection
                                            // and main short-circuits to the latched error without
                                            // re-running install.ps1.
                                            try {
                                                await window.hermesDesktop?.resetBootstrap?.();
                                            }
                                            catch {
                                                // best-effort -- continue with reload regardless
                                            }
                                            window.location.reload();
                                        }, size: "sm", variant: "default", children: copy.reloadRetry })] })] }) }))] }) }));
}
