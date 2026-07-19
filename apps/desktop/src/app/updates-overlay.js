import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { writeClipboardText } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ErrorIcon, ErrorState } from '@/components/ui/error-state';
import { Loader } from '@/components/ui/loader';
import { useI18n } from '@/i18n';
import { buildCommitChangelog } from '@/lib/commit-changelog';
import { AlertCircle, Check, Copy, Terminal } from '@/lib/icons';
import { resolveUpdateCopy } from '@/lib/update-copy';
import { cn } from '@/lib/utils';
import { $backendUpdateApply, $backendUpdateChecking, $backendUpdateStatus, $updateApply, $updateChecking, $updateOverlayOpen, $updateOverlayTarget, $updateStatus, applyBackendUpdate, applyUpdates, checkBackendUpdates, checkUpdates, resetUpdateApplyState, setUpdateOverlayOpen } from '@/store/updates';
function totalItems(groups) {
    return groups.reduce((sum, g) => sum + g.items.length, 0);
}
export function UpdatesOverlay() {
    const open = useStore($updateOverlayOpen);
    const target = useStore($updateOverlayTarget);
    const clientStatus = useStore($updateStatus);
    const clientChecking = useStore($updateChecking);
    const clientApply = useStore($updateApply);
    const backendStatus = useStore($backendUpdateStatus);
    const backendChecking = useStore($backendUpdateChecking);
    const backendApply = useStore($backendUpdateApply);
    const isBackend = target === 'backend';
    const status = isBackend ? backendStatus : clientStatus;
    const checking = isBackend ? backendChecking : clientChecking;
    const apply = isBackend ? backendApply : clientApply;
    const check = isBackend ? checkBackendUpdates : checkUpdates;
    const install = isBackend ? applyBackendUpdate : applyUpdates;
    useEffect(() => {
        if (open && !status && !checking) {
            void check();
        }
    }, [check, checking, open, status]);
    const behind = status?.behind ?? 0;
    const updateAvailable = status?.updateAvailable || behind > 0;
    const phase = apply.stage === 'manual'
        ? 'manual'
        : apply.stage === 'guiSkew'
            ? 'guiSkew'
            : apply.applying || apply.stage === 'restart'
                ? 'applying'
                : apply.stage === 'error'
                    ? 'error'
                    : 'idle';
    const handleClose = (next) => {
        if (phase === 'applying') {
            return;
        }
        setUpdateOverlayOpen(next);
        if (!next &&
            (apply.stage === 'error' || apply.stage === 'restart' || apply.stage === 'manual' || apply.stage === 'guiSkew')) {
            resetUpdateApplyState();
        }
    };
    const handleInstall = () => {
        void install();
    };
    return (_jsx(Dialog, { onOpenChange: handleClose, open: open, children: _jsxs(DialogContent, { className: "max-w-sm overflow-hidden p-0 gap-0", showCloseButton: phase !== 'applying', children: [phase === 'applying' && _jsx(ApplyingView, { apply: apply, isBackend: isBackend }), phase === 'manual' && (_jsx(ManualView, { command: apply.command ?? null, message: apply.message, onDone: () => handleClose(false) })), phase === 'guiSkew' && _jsx(GuiSkewView, { message: apply.message, onDone: () => handleClose(false) }), phase === 'error' && (_jsx(ErrorView, { message: apply.message, onDismiss: () => handleClose(false), onRetry: handleInstall })), phase === 'idle' && (_jsx(IdleView, { behind: behind, checking: checking, commits: status?.commits ?? [], onInstall: handleInstall, onLater: () => handleClose(false), onRetryCheck: () => void check(), status: status, target: target, updateAvailable: updateAvailable }))] }) }));
}
function IdleView({ behind, checking, commits, onInstall, onLater, onRetryCheck, status, target, updateAvailable }) {
    const { t } = useI18n();
    const u = t.updates;
    if (!status && checking) {
        return (_jsx(CenteredStatus, { icon: _jsx(Loader, { className: "size-12", label: u.checking, type: "lemniscate-bloom" }), title: u.checking }));
    }
    if (!status) {
        return (_jsx(CenteredStatus, { action: _jsx(Button, { onClick: onRetryCheck, size: "sm", children: u.tryAgain }), icon: _jsx(ErrorIcon, {}), title: u.checkFailedTitle }));
    }
    if (!status.supported) {
        return (_jsx(CenteredStatus, { body: status.message ?? u.unsupportedMessage, icon: _jsx(AlertCircle, { className: "size-6 text-muted-foreground" }), title: u.notAvailableTitle }));
    }
    if (status.error) {
        return (_jsx(CenteredStatus, { action: _jsx(Button, { disabled: checking, onClick: onRetryCheck, size: "sm", children: u.tryAgain }), body: u.connectionRetry, icon: _jsx(ErrorIcon, {}), title: u.checkFailedTitle }));
    }
    if (!updateAvailable) {
        return (_jsx(CenteredStatus, { body: target === 'backend' ? u.latestBodyBackend : u.latestBody, icon: _jsx(BrandMark, { className: "size-12" }), title: u.allSetTitle }));
    }
    const groups = buildCommitChangelog(commits);
    const shownItems = totalItems(groups);
    const remaining = Math.max(0, behind - shownItems);
    // Name what's being updated. In remote mode the overlay acts on the connected
    // backend, not the local client — say so. When there are no commit rows to
    // show (e.g. pip/non-git backend), degrade to honest "no release notes" copy
    // instead of generic filler.
    const { title, body } = resolveUpdateCopy({ target, shownItems, copy: u });
    return (_jsxs("div", { className: "grid gap-5 px-6 pb-6 pt-7 pr-8", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(BrandMark, { className: "size-16" }), _jsx(DialogTitle, { className: "text-center text-xl", children: title }), _jsx(DialogDescription, { className: "text-center text-sm", children: body })] }), _jsx("div", { className: "grid gap-3", children: groups.map(group => (_jsxs("div", { children: [_jsx("p", { className: "text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground", children: group.label }), _jsx("ul", { className: "mt-1.5 grid gap-1.5 text-xs text-foreground", children: group.items.map(item => (_jsxs("li", { className: "flex items-start gap-2", children: [_jsx("span", { "aria-hidden": true, className: "mt-1.5 inline-block size-1 shrink-0 rounded-full bg-primary" }), _jsx("span", { className: "leading-snug", children: item })] }, item))) })] }, group.id))) }), _jsxs("div", { className: "grid gap-2", children: [_jsx(Button, { className: "font-semibold", onClick: onInstall, size: "lg", children: u.updateNow }), _jsx(Button, { className: "font-medium", onClick: onLater, type: "button", variant: "text", children: u.maybeLater })] }), remaining > 0 && _jsx("p", { className: "text-center text-xs text-muted-foreground", children: u.moreChanges(remaining) })] }));
}
function ManualView({ command, message, onDone }) {
    const { t } = useI18n();
    const u = t.updates;
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        if (!command) {
            return;
        }
        void writeClipboardText(command).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        });
    };
    // No command (e.g. the Linux sandbox-blocked relaunch): render the explanatory
    // message + a Done button, not a copy-a-command box.
    if (!command) {
        return (_jsxs("div", { className: "grid gap-5 px-6 pb-6 pt-7 pr-8", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(Terminal, { className: "size-8 text-primary" }), _jsx(DialogTitle, { className: "text-center text-xl", children: u.manualTitle }), _jsx(DialogDescription, { className: "text-center text-sm", children: message || u.manualPickedUp })] }), _jsx(Button, { className: "font-semibold", onClick: onDone, size: "lg", variant: "secondary", children: u.done })] }));
    }
    return (_jsxs("div", { className: "grid gap-5 px-6 pb-6 pt-7 pr-8", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(Terminal, { className: "size-8 text-primary" }), _jsx(DialogTitle, { className: "text-center text-xl", children: u.manualTitle }), _jsx(DialogDescription, { className: "text-center text-sm", children: u.manualBody })] }), _jsxs("button", { className: cn('group flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors', copied ? 'border-primary/50' : 'border-(--stroke-nous) hover:border-(--ui-stroke-secondary)'), onClick: handleCopy, type: "button", children: [_jsxs("code", { className: "min-w-0 flex-1 truncate select-all font-mono text-sm text-foreground", children: [_jsx("span", { className: "select-none text-muted-foreground", children: "$ " }), command] }), _jsxs("span", { className: cn('flex shrink-0 items-center gap-1 text-xs font-medium transition-colors', copied ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'), children: [copied ? _jsx(Check, { className: "size-3.5" }) : _jsx(Copy, { className: "size-3.5" }), copied ? u.copied : u.copy] })] }), _jsx("p", { className: "text-center text-xs text-muted-foreground", children: u.manualPickedUp }), _jsx(Button, { className: "font-semibold", onClick: onDone, size: "lg", variant: "secondary", children: u.done })] }));
}
// Linux GUI/backend skew (#45205): backend updated, but the running desktop app
// package (AppImage/.deb/.rpm) was NOT changed. Closeable terminal state that
// tells the user to update/reinstall the desktop app — never claims the GUI was
// updated.
function GuiSkewView({ message, onDone }) {
    const { t } = useI18n();
    const u = t.updates;
    return (_jsxs("div", { className: "grid gap-5 px-6 pb-6 pt-7 pr-8", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(AlertCircle, { className: "size-8 text-amber-500" }), _jsx(DialogTitle, { className: "text-center text-xl", children: u.guiSkewTitle }), _jsx(DialogDescription, { className: "max-w-prose text-center text-sm leading-5 text-muted-foreground", children: message || u.guiSkewBody })] }), _jsx(Button, { className: "font-semibold", onClick: onDone, size: "lg", variant: "secondary", children: u.done })] }));
}
function ApplyingView({ apply, isBackend }) {
    const { t } = useI18n();
    const u = t.updates;
    const label = u.stages[apply.stage] ?? u.stages.idle;
    const body = isBackend ? u.applyingBodyBackend : u.applyingBody;
    const currentMessage = apply.message.trim();
    const recentLog = apply.log.slice(-4);
    const percent = typeof apply.percent === 'number' && Number.isFinite(apply.percent)
        ? Math.max(2, Math.min(100, Math.round(apply.percent)))
        : null;
    return (_jsxs("div", { className: "grid gap-5 px-6 pb-6 pt-7", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx(Loader, { className: "size-16", label: label, type: "lemniscate-bloom" }), _jsx(DialogTitle, { className: "text-center text-xl", children: label }), _jsx(DialogDescription, { className: "text-center text-sm", children: body }), currentMessage ? (_jsx("p", { className: "max-w-lg break-words text-center text-xs leading-5 text-muted-foreground", children: currentMessage })) : null] }), _jsx("div", { className: "h-2 overflow-hidden rounded-full bg-muted", children: _jsx("div", { className: cn('h-full rounded-full bg-primary transition-[width] duration-300 ease-out', percent === null && 'w-1/3 animate-pulse'), style: percent !== null ? { width: `${percent}%` } : undefined }) }), recentLog.length > 1 ? (_jsx("div", { className: "max-h-24 overflow-hidden rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-left font-mono text-[11px] leading-4 text-muted-foreground", children: recentLog.map((entry, index) => (_jsx("div", { className: "truncate", children: entry.message }, `${entry.at}-${index}`))) })) : null, _jsx("p", { className: "text-center text-xs text-muted-foreground", children: u.applyingClose })] }));
}
function ErrorView({ message, onDismiss, onRetry }) {
    const { t } = useI18n();
    const u = t.updates;
    return (_jsxs(ErrorState, { className: "px-6 pb-6 pt-7 pr-8", description: _jsx(DialogDescription, { className: "max-w-prose text-center text-sm leading-5 text-muted-foreground", children: message || u.errorBody }), title: _jsx(DialogTitle, { className: "text-center text-xl font-semibold tracking-tight", children: u.errorTitle }), children: [_jsx(Button, { className: "font-semibold", onClick: onRetry, size: "lg", children: u.tryAgain }), _jsx(Button, { onClick: onDismiss, variant: "text", children: u.notNow })] }));
}
function CenteredStatus({ action, body, icon, title }) {
    return (_jsxs("div", { className: "grid gap-4 px-6 pb-6 pt-8 pr-8", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [icon, _jsx(DialogTitle, { className: "text-center text-lg", children: title }), body && _jsx(DialogDescription, { className: "text-center text-sm", children: body })] }), action && _jsx("div", { className: "flex justify-center", children: action })] }));
}
