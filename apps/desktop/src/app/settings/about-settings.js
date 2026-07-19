import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { useI18n } from '@/i18n';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { $desktopVersion, $updateApply, $updateChecking, $updateStatus, checkUpdates, openUpdatesWindow, refreshDesktopVersion, startActiveUpdate } from '@/store/updates';
import { ListRow, SectionHeading, SettingsContent } from './primitives';
import { UninstallSection } from './uninstall-section';
const RELEASE_NOTES_URL = 'https://github.com/NousResearch/hermes-agent/releases';
function relativeTime(ms, a) {
    if (!ms) {
        return a.never;
    }
    const diff = Date.now() - ms;
    if (diff < 60_000) {
        return a.justNow;
    }
    if (diff < 3_600_000) {
        return a.minAgo(Math.round(diff / 60_000));
    }
    if (diff < 86_400_000) {
        return a.hoursAgo(Math.round(diff / 3_600_000));
    }
    return a.daysAgo(Math.round(diff / 86_400_000));
}
export function AboutSettings() {
    const { t } = useI18n();
    const a = t.settings.about;
    const version = useStore($desktopVersion);
    const status = useStore($updateStatus);
    const apply = useStore($updateApply);
    const checking = useStore($updateChecking);
    const [justChecked, setJustChecked] = useState(false);
    // The version atom is loaded once at app boot, which makes About show a
    // stale number after a self-update (the running binary is current, the
    // displayed string is not). Re-read on mount so opening About always
    // reflects the running build.
    useEffect(() => {
        void refreshDesktopVersion();
    }, []);
    const behind = status?.behind ?? 0;
    const supported = status?.supported !== false;
    const applying = apply.applying || apply.stage === 'restart';
    const handleCheck = async () => {
        setJustChecked(false);
        const next = await checkUpdates();
        setJustChecked(Boolean(next));
    };
    let statusLine;
    let statusTone = 'idle';
    if (!supported) {
        statusLine = status?.message ?? a.cantUpdate;
        statusTone = 'error';
    }
    else if (status?.error) {
        statusLine = a.cantReach;
        statusTone = 'error';
    }
    else if (applying) {
        statusLine = a.installing;
        statusTone = 'available';
    }
    else if (behind > 0) {
        statusLine = a.updateReady(behind);
        statusTone = 'available';
    }
    else if (status) {
        statusLine = a.onLatest;
    }
    else {
        statusLine = a.tapCheck;
    }
    return (_jsxs(SettingsContent, { children: [_jsxs("div", { className: "flex flex-col items-center gap-3 pt-6 pb-2 text-center", children: [_jsx(BrandMark, { className: "size-16" }), _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold tracking-tight", children: a.heading }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: version?.appVersion ? a.version(version.appVersion) : a.versionUnavailable })] })] }), _jsxs("div", { className: "mx-auto mt-4 w-full max-w-2xl", children: [_jsx(SectionHeading, { icon: RefreshCw, title: a.updates }), _jsxs("div", { className: cn('rounded-xl border px-4 py-3 text-sm', statusTone === 'available' && 'border-primary/30 bg-primary/5 text-foreground', statusTone === 'error' && 'border-destructive/35 bg-destructive/5 text-destructive', statusTone === 'idle' && 'border-border/70 bg-muted/20 text-foreground'), children: [_jsxs("div", { className: "flex items-start gap-2", children: [statusTone === 'available' ? (_jsx(Codicon, { className: "mt-0.5 size-4 shrink-0 text-primary", name: "cloud-download", size: "1rem" })) : statusTone === 'error' ? null : (_jsx(CheckCircle2, { className: "mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" })), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-medium", children: statusLine }), _jsxs("p", { className: "mt-1 text-xs text-muted-foreground", children: [a.lastChecked(relativeTime(status?.fetchedAt, a)), justChecked && !checking ? a.justNowSuffix : ''] })] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-4", children: [_jsxs(Button, { disabled: checking || applying || !supported, onClick: () => void handleCheck(), size: "sm", variant: "textStrong", children: [checking ? _jsx(Loader2, { className: "size-3 animate-spin" }) : _jsx(RefreshCw, { className: "size-3" }), checking ? a.checking : a.checkNow] }), behind > 0 && supported && !applying && (_jsxs(_Fragment, { children: [_jsx(Button, { onClick: () => startActiveUpdate(), size: "sm", children: a.updateNow }), _jsx(Button, { onClick: () => openUpdatesWindow(), size: "sm", variant: "textStrong", children: a.seeWhatsNew })] })), _jsx(Button, { asChild: true, className: "ml-auto", size: "sm", variant: "text", children: _jsxs("a", { href: RELEASE_NOTES_URL, onClick: event => {
                                                event.preventDefault();
                                                void window.hermesDesktop?.openExternal?.(RELEASE_NOTES_URL);
                                            }, rel: "noreferrer", target: "_blank", children: [_jsx(ExternalLink, { className: "size-3" }), a.releaseNotes] }) })] })] }), _jsx(ListRow, { description: a.automaticUpdatesDesc, hint: a.branchCommit(status?.branch ?? 'unknown', status?.currentSha?.slice(0, 7) ?? 'unknown'), title: a.automaticUpdates }), _jsx(UninstallSection, {})] })] }));
}
