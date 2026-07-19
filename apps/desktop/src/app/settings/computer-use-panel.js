import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getActionStatus, getComputerUseStatus, grantComputerUsePermissions } from '@/hermes';
import { AlertTriangle, Check, ExternalLink, Loader2, RefreshCw, X } from '@/lib/icons';
import { upsertDesktopActionTask } from '@/store/activity';
import { notify, notifyError } from '@/store/notifications';
import { Pill } from './primitives';
// Per-OS one-liner shown when there's no TCC grant flow (Windows/Linux). macOS
// drives the permission rows instead, so it has no entry here.
const PLATFORM_NOTE = {
    linux: 'Drives your desktop via the X11/XWayland accessibility stack — no permission prompt.',
    win32: 'First run may trigger a Windows SmartScreen prompt for the cua-driver UIAccess worker — allow it.'
};
function tone(granted) {
    return granted === true ? 'primary' : 'muted';
}
function GrantIcon({ granted }) {
    const Icon = granted === true ? Check : granted === false ? X : AlertTriangle;
    return _jsx(Icon, { className: "size-3" });
}
function PermissionRow({ granted, label, hint }) {
    return (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/55 p-2.5", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("span", { className: "text-sm font-medium", children: label }), _jsx("p", { className: "mt-0.5 text-[0.7rem] text-muted-foreground", children: hint })] }), _jsxs(Pill, { tone: tone(granted), children: [_jsx(GrantIcon, { granted: granted }), granted === true ? 'Granted' : granted === false ? 'Not granted' : 'Unknown'] })] }));
}
/**
 * Cross-platform Computer Use preflight card.
 *
 * cua-driver runs on macOS, Windows, and Linux, but readiness differs: macOS
 * needs two TCC grants (Accessibility + Screen Recording) that attach to
 * cua-driver's own `com.trycua.driver` identity — not Hermes — and are
 * requested via `cua-driver permissions grant` (dialog attributed to
 * CuaDriver). Windows/Linux have no TCC toggles, so readiness is driver health
 * from `cua-driver doctor`. The backend folds both into one `ready` signal.
 *
 * Binary install/upgrade stays in the cua-driver provider's post-setup runner
 * below this card (the generic ToolsetConfigPanel).
 */
export function ComputerUsePanel({ onConfiguredChange }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [granting, setGranting] = useState(false);
    const activeRef = useRef(false);
    const refresh = useCallback(async () => {
        try {
            setStatus(await getComputerUseStatus());
        }
        catch (err) {
            notifyError(err, 'Could not read Computer Use status');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        activeRef.current = true;
        void refresh();
        return () => void (activeRef.current = false);
    }, [refresh]);
    const grant = useCallback(async () => {
        setGranting(true);
        try {
            const started = await grantComputerUsePermissions();
            if (!started.ok) {
                notifyError(new Error('spawn failed'), 'Could not request permissions');
                return;
            }
            notify({
                kind: 'info',
                title: 'Approve in System Settings',
                message: 'macOS will show a permission dialog attributed to CuaDriver. Approve it, then return here.'
            });
            // The driver waits for the user to flip the switch — poll until it exits.
            for (let attempt = 0; attempt < 150 && activeRef.current; attempt += 1) {
                await new Promise(resolve => window.setTimeout(resolve, 1500));
                if (!activeRef.current) {
                    break;
                }
                const polled = await getActionStatus(started.name, 200);
                upsertDesktopActionTask(polled);
                if (!polled.running) {
                    break;
                }
            }
            if (activeRef.current) {
                await refresh();
                onConfiguredChange?.();
            }
        }
        catch (err) {
            if (activeRef.current) {
                notifyError(err, 'Could not request permissions');
            }
        }
        finally {
            if (activeRef.current) {
                setGranting(false);
            }
        }
    }, [onConfiguredChange, refresh]);
    if (loading) {
        return (_jsxs("div", { className: "flex items-center gap-2 px-1 text-xs text-muted-foreground", children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), "Checking Computer Use status\u2026"] }));
    }
    if (!status) {
        return null;
    }
    if (!status.platform_supported) {
        return (_jsxs("p", { className: "px-1 text-xs text-muted-foreground", children: ["Computer Use isn't supported on this platform (", status.platform, ")."] }));
    }
    if (!status.installed) {
        return (_jsxs("p", { className: "px-1 text-xs text-muted-foreground", children: ["Install the cua-driver backend below to drive this machine.", status.can_grant && ' Then grant Accessibility and Screen Recording here.'] }));
    }
    const failingChecks = status.checks.filter(c => c.status !== 'ok');
    return (_jsxs("div", { className: "grid gap-2", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 px-1", children: [_jsxs("div", { className: "min-w-0", children: [status.can_grant ? (_jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: "Grants attach to CuaDriver's own identity (com.trycua.driver), not Hermes \u2014 so the dialog is attributed to the process that drives your Mac." })) : (_jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: PLATFORM_NOTE[status.platform] ?? '' })), status.version && _jsx("p", { className: "text-[0.68rem] text-muted-foreground/80", children: status.version })] }), _jsxs(Button, { onClick: () => void refresh(), size: "sm", variant: "text", children: [_jsx(RefreshCw, { className: "size-3.5" }), "Recheck"] })] }), status.can_grant ? (_jsxs(_Fragment, { children: [_jsx(PermissionRow, { granted: status.accessibility, hint: "Lets cua-driver post clicks, keystrokes, and read the accessibility tree.", label: "Accessibility" }), _jsx(PermissionRow, { granted: status.screen_recording, hint: "Lets cua-driver capture screenshots of app windows.", label: "Screen Recording" })] })) : (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/55 p-2.5", children: [_jsx("span", { className: "text-sm font-medium", children: "Driver health" }), _jsxs(Pill, { tone: tone(status.ready), children: [_jsx(GrantIcon, { granted: status.ready }), status.ready === true ? 'Ready' : status.ready === false ? 'Not ready' : 'Unknown'] })] })), failingChecks.map(c => (_jsxs("p", { className: "px-1 text-[0.7rem] text-muted-foreground", children: [_jsx(AlertTriangle, { className: "mr-1 inline size-3" }), c.label, ": ", c.message] }, c.label))), status.error && (_jsxs("p", { className: "px-1 text-[0.7rem] text-muted-foreground", children: [_jsx(AlertTriangle, { className: "mr-1 inline size-3" }), status.error] })), status.ready ? (_jsxs("div", { className: "flex items-center gap-1.5 px-1 text-xs text-muted-foreground", children: [_jsx(Check, { className: "size-3.5" }), "Computer Use is ready. Ask the agent to capture an app and click around."] })) : (status.can_grant && (_jsxs(Button, { disabled: granting, onClick: () => void grant(), size: "sm", children: [granting ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(ExternalLink, { className: "size-3.5" }), granting ? 'Waiting for approval…' : 'Grant permissions'] })))] }));
}
