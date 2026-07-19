import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { cn } from '@/lib/utils';
/**
 * DesktopDataPathOverlay
 *
 * Shown on first launch when the user hasn't chosen a HERMES_HOME yet.
 * Lets the user pick where Hermes stores its data (sessions, config, logs,
 * Python agent) before the bootstrap installs anything.
 *
 * Subscribes to the 'hermes:data-path:choose' event from the main process.
 * When the user confirms their choice (or picks the default), calls
 * dataPath.set() which triggers the deferred bootstrap in the main process.
 */
export function DesktopDataPathOverlay({ enabled = true }) {
    const [visible, setVisible] = useState(false);
    const [defaultPath, setDefaultPath] = useState('');
    const [chosenPath, setChosenPath] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return;
        }
        const bridge = window.hermesDesktop;
        if (!bridge?.onDataPathChoose || !bridge?.dataPath) {
            return;
        }
        return bridge.onDataPathChoose((payload) => {
            setDefaultPath(payload.defaultPath);
            setChosenPath(null);
            setError(null);
            setVisible(true);
        });
    }, [enabled]);
    if (!visible || !enabled) {
        return null;
    }
    const displayPath = chosenPath ?? defaultPath;
    const isCustom = chosenPath !== null && chosenPath !== defaultPath;
    const handleCustomize = async () => {
        try {
            const result = await window.hermesDesktop.dataPath.pick();
            if (!result.canceled && result.path) {
                setChosenPath(result.path);
                setError(null);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };
    const handleConfirm = async () => {
        const path = chosenPath ?? defaultPath;
        if (!path) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await window.hermesDesktop.dataPath.set(path);
            // The main process calls startHermes() after setting the path,
            // which begins the bootstrap. The DesktopInstallOverlay takes
            // over from here — we just hide ourselves.
            setVisible(false);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSaving(false);
        }
    };
    return (_jsx("div", { className: cn('fixed inset-0 z-50 flex items-center justify-center', 'bg-[var(--ui-bg-primary)]/80 backdrop-blur-sm'), children: _jsxs("div", { className: cn('flex w-full max-w-lg flex-col gap-6 rounded-xl p-8', 'border border-[var(--stroke-nous)] bg-[var(--ui-bg-primary)]', 'shadow-nous'), children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(BrandMark, { className: "size-8" }), _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-[var(--ui-text-primary)]", children: "Choose Data Location" }), _jsx("p", { className: "mt-1 text-sm text-[var(--ui-text-secondary)]", children: "Hermes will store sessions, configuration, logs, and the Python agent in this folder." })] })] }), _jsxs("div", { className: cn('flex flex-col gap-2 rounded-lg border border-[var(--ui-stroke-tertiary)] p-4', 'bg-[var(--ui-bg-secondary)]'), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium text-[var(--ui-text-tertiary)] uppercase tracking-wide", children: "Data Location" }), isCustom && (_jsx("button", { onClick: () => {
                                        setChosenPath(null);
                                        setError(null);
                                    }, className: "text-xs text-[var(--ui-accent)] hover:underline", children: "Reset to default" }))] }), _jsxs("div", { className: "flex items-center gap-2 text-sm text-[var(--ui-text-primary)] font-mono break-all", children: [_jsx(Codicon, { name: "folder", className: "size-4 shrink-0 text-[var(--ui-text-secondary)]" }), _jsx("span", { children: displayPath })] }), _jsxs(Button, { variant: "outline", size: "sm", onClick: handleCustomize, className: "self-start", children: [_jsx(Codicon, { name: "folder-opened", className: "size-3.5" }), _jsx("span", { className: "ml-1.5", children: "Choose different folder..." })] })] }), _jsx("p", { className: "text-xs text-[var(--ui-text-tertiary)]", children: "The Python environment requires approximately 2 GB of disk space. Choose a drive with sufficient free space." }), error && (_jsx("div", { className: "rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400", children: error })), _jsxs("div", { className: "flex items-center justify-end gap-3", children: [_jsx(Button, { variant: "secondary", size: "default", onClick: handleConfirm, disabled: saving, children: saving ? (_jsxs(_Fragment, { children: [_jsx(Codicon, { name: "loading", className: "size-4 animate-spin" }), _jsx("span", { className: "ml-1.5", children: "Installing..." })] })) : ('Start Installation') }), _jsx("span", { className: "text-xs text-[var(--ui-text-tertiary)]", children: "You can change this later from Settings." })] })] }) }));
}
