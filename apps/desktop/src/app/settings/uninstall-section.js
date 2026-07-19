import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { SectionHeading } from './primitives';
const OPTIONS = [
    {
        mode: 'gui',
        title: 'Uninstall Chat GUI only',
        description: 'Remove this desktop app. The Hermes agent, your config, and chats all stay.',
        consequence: 'the desktop Chat GUI (this app and its data)',
        needsAgent: false
    },
    {
        mode: 'lite',
        title: 'Uninstall GUI + agent, keep my data',
        description: 'Remove the app and the Hermes agent, but keep config, chats, and secrets for a future reinstall.',
        consequence: 'the Chat GUI and the Hermes agent (config, chats, and secrets are kept)',
        needsAgent: true
    },
    {
        mode: 'full',
        title: 'Uninstall everything',
        description: 'Remove the app, the agent, and all user data — config, chats, scheduled jobs, secrets, logs.',
        consequence: 'EVERYTHING — the Chat GUI, the Hermes agent, and all of your config, chats, secrets, and logs',
        // full removes the agent (and user data), so it's an agent-removing option:
        // hide it on a lite client with no local agent, same as lite. A lite client
        // connecting to a remote backend has no local agent OR local user data the
        // GUI installed, so gui-only is the correct (and only) option there.
        needsAgent: true
    }
];
export function UninstallSection() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let alive = true;
        const bridge = window.hermesDesktop?.uninstall;
        if (!bridge) {
            setLoading(false);
            return;
        }
        void bridge
            .summary()
            .then(result => {
            if (alive) {
                setSummary(result);
            }
        })
            .catch(() => {
            // Non-fatal — we degrade to offering the GUI-only option.
        })
            .finally(() => {
            if (alive) {
                setLoading(false);
            }
        });
        return () => {
            alive = false;
        };
    }, []);
    const bridge = window.hermesDesktop?.uninstall;
    if (!bridge) {
        return null;
    }
    // Gate the agent-removing options on whether an agent is actually present.
    // A future lite client that ships without the bundled agent shows GUI-only.
    const agentInstalled = summary?.agent_installed ?? false;
    const visibleOptions = OPTIONS.filter(opt => agentInstalled || !opt.needsAgent);
    const handleConfirm = async () => {
        if (!pending) {
            return;
        }
        setRunning(true);
        setError(null);
        try {
            const result = await bridge.run(pending);
            if (!result.ok) {
                setError(result.message || result.error || 'Uninstall could not start.');
                setRunning(false);
                setPending(null);
            }
            // On success the app quits shortly; keep the spinner up until it does.
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setRunning(false);
            setPending(null);
        }
    };
    const pendingOption = OPTIONS.find(opt => opt.mode === pending) ?? null;
    return (_jsxs("div", { className: "mx-auto mt-8 w-full max-w-2xl", children: [_jsx(SectionHeading, { icon: AlertTriangle, title: "Danger zone" }), _jsx("div", { className: "rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3", children: loading ? (_jsxs("div", { className: "flex items-center gap-2 py-2 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), "Checking what's installed\u2026"] })) : pendingOption ? (_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-destructive", children: "Confirm uninstall" }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: ["This removes ", pendingOption.consequence, ". This can't be undone."] }), summary?.running_app_path && (_jsxs("p", { className: "mt-1 font-mono text-[0.68rem] text-muted-foreground/60", children: ["App: ", summary.running_app_path] })), error && _jsx("p", { className: "mt-2 text-xs text-destructive", children: error }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-3", children: [_jsxs(Button, { disabled: running, onClick: () => void handleConfirm(), size: "sm", variant: "destructive", children: [running && _jsx(Loader2, { className: "size-3 animate-spin" }), running ? 'Uninstalling…' : 'Yes, uninstall'] }), _jsx(Button, { disabled: running, onClick: () => setPending(null), size: "sm", variant: "text", children: "Cancel" })] })] })) : (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "text-sm font-medium", children: "Uninstall Hermes" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Choose how much to remove. The app closes to finish the job; reopen the installer any time to come back." }), _jsx("div", { className: "mt-1 flex flex-col gap-2", children: visibleOptions.map(opt => (_jsxs("button", { className: cn('flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-left transition', 'hover:border-destructive/40 hover:bg-destructive/5'), onClick: () => {
                                    setError(null);
                                    setPending(opt.mode);
                                }, type: "button", children: [_jsx(Trash2, { className: "mt-0.5 size-4 shrink-0 text-muted-foreground" }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block text-sm font-medium text-foreground", children: opt.title }), _jsx("span", { className: "mt-0.5 block text-xs text-muted-foreground", children: opt.description })] })] }, opt.mode))) })] })) })] }));
}
