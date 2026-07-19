import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorIcon } from '@/components/ui/error-state';
import { LogView } from '@/components/ui/log-view';
import { useI18n } from '@/i18n';
import { FileText, Loader2, LogIn, RefreshCw, Wrench } from '@/lib/icons';
import { $desktopBoot } from '@/store/boot';
import { notify, notifyError } from '@/store/notifications';
import { $desktopOnboarding } from '@/store/onboarding';
import { deriveProviderShape, isRemoteReauthFailure, signInLabel } from './boot-failure-reauth';
// A remote gateway whose access cookie has lapsed (e.g. the dashboard
// restarted on the remote box) boots into this overlay with a reauth-shaped
// error. The local-recovery buttons (Retry resets the local bootstrap latch;
// Repair re-runs the installer) are no-ops for that case — the only fix is to
// re-establish the remote session. The detection + copy helpers live in
// ./boot-failure-reauth so they're unit-testable without a React render.
// Recovery surface for a hard boot failure (gateway never came up, backend
// exited during startup, bootstrap latched, …). Without this the app shell
// renders dead — "gateway offline", no composer, only a toast — with no way
// to retry, repair the install, switch the gateway, or find the logs.
export function BootFailureOverlay() {
    const boot = useStore($desktopBoot);
    const onboarding = useStore($desktopOnboarding);
    const { t } = useI18n();
    const [busy, setBusy] = useState(null);
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);
    const [remoteReauth, setRemoteReauth] = useState(null);
    const visible = Boolean(boot.error) && !boot.running;
    // While first-run onboarding owns the picker/flow we let it surface its own
    // progress; the recovery overlay is for hard failures, which it covers via a
    // higher z-index regardless of onboarding state.
    const suppressed = onboarding.flow.status !== 'idle' && onboarding.flow.status !== 'error';
    useEffect(() => {
        if (!visible) {
            return;
        }
        void window.hermesDesktop
            ?.getRecentLogs()
            .then(res => setLogs(res.lines ?? []))
            .catch(() => undefined);
    }, [visible]);
    // Resolve whether this boot failure is a remote-gateway reauth so we can
    // offer the actionable "Sign in" path instead of the local-only recovery
    // buttons. Runs whenever the overlay becomes visible.
    useEffect(() => {
        if (!visible) {
            setRemoteReauth(null);
            return;
        }
        let cancelled = false;
        void (async () => {
            const desktop = window.hermesDesktop;
            if (!desktop?.getConnectionConfig) {
                return;
            }
            let config;
            try {
                config = await desktop.getConnectionConfig();
            }
            catch {
                return;
            }
            if (cancelled || !isRemoteReauthFailure(config)) {
                return;
            }
            // Best-effort probe for the provider shape so the button copy matches
            // what the user will see in the login window (password form vs OAuth
            // redirect). Probe failure just keeps the generic copy.
            let shape = deriveProviderShape(null);
            try {
                const probe = await desktop.probeConnectionConfig(config.remoteUrl);
                shape = deriveProviderShape(probe?.providers);
            }
            catch {
                // Generic copy is fine.
            }
            if (!cancelled) {
                setRemoteReauth({ url: config.remoteUrl, ...shape });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible]);
    if (!visible || suppressed) {
        return null;
    }
    const retry = async () => {
        setBusy('retry');
        await window.hermesDesktop?.resetBootstrap().catch(() => undefined);
        window.location.reload();
    };
    const repair = async () => {
        setBusy('repair');
        await window.hermesDesktop?.repairBootstrap().catch(() => undefined);
        window.location.reload();
    };
    const switchToLocalGateway = async () => {
        setBusy('local');
        // applyConnectionConfig reloads the window from the main process.
        await window.hermesDesktop?.applyConnectionConfig({ mode: 'local' }).catch(() => undefined);
        setBusy(null);
    };
    // Open the gateway's login window (renders the username/password form for a
    // basic gateway, or the OAuth redirect otherwise — the desktop drives both
    // through the same window). On a successful sign-in the session cookie is
    // re-established in the persistent partition; reload so boot re-runs and the
    // reconnect now mints a ticket against a live session.
    const signInRemote = async () => {
        if (!remoteReauth) {
            return;
        }
        setBusy('signin');
        try {
            const result = await window.hermesDesktop?.oauthLoginConnectionConfig(remoteReauth.url);
            if (result?.connected) {
                notify({ kind: 'success', title: t.boot.failure.signedInTitle, message: t.boot.failure.signedInMessage });
                window.location.reload();
                return;
            }
            notify({
                kind: 'warning',
                title: t.boot.failure.signInIncompleteTitle,
                message: t.boot.failure.signInIncompleteMessage
            });
        }
        catch (err) {
            notifyError(err, t.boot.failure.signInFailed);
        }
        finally {
            setBusy(null);
        }
    };
    const openLogs = () => void window.hermesDesktop?.revealLogs().catch(() => undefined);
    const copy = t.boot.failure;
    const label = signInLabel(remoteReauth, {
        identityProvider: copy.identityProvider,
        remoteGateway: copy.signInToRemoteGateway,
        withProvider: copy.signInWithProvider
    });
    return (_jsx("div", { className: "fixed inset-0 z-[1400] flex items-center justify-center bg-(--ui-chat-surface-background) p-6", children: _jsxs("div", { className: "w-full max-w-[40rem] overflow-hidden rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) shadow-nous", children: [_jsxs("div", { className: "flex items-start gap-3 px-5 py-4", children: [_jsx(ErrorIcon, { className: "mt-0.5", size: "1.25rem" }), _jsxs("div", { children: [_jsx("h2", { className: "text-[0.9375rem] font-semibold tracking-tight", children: remoteReauth ? copy.remoteTitle : copy.title }), _jsx("p", { className: "mt-1 text-[0.8125rem] leading-5 text-(--ui-text-tertiary)", children: remoteReauth ? copy.remoteDescription : copy.description })] })] }), _jsxs("div", { className: "grid gap-4 p-5", children: [_jsx("div", { className: "rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive", children: boot.error }), _jsxs("div", { className: "grid gap-2", children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [remoteReauth ? (_jsxs(Button, { disabled: Boolean(busy), onClick: () => void signInRemote(), children: [busy === 'signin' ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(LogIn, {}), label] })) : (_jsxs(Button, { disabled: Boolean(busy), onClick: () => void retry(), children: [busy === 'retry' ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(RefreshCw, {}), copy.retry] })), !remoteReauth ? (_jsxs(Button, { disabled: Boolean(busy), onClick: () => void repair(), variant: "secondary", children: [busy === 'repair' ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(Wrench, {}), copy.repairInstall] })) : null, _jsxs(Button, { disabled: Boolean(busy), onClick: () => void switchToLocalGateway(), variant: "secondary", children: [busy === 'local' ? _jsx(Loader2, { className: "animate-spin" }) : null, copy.useLocalGateway] }), _jsxs(Button, { onClick: openLogs, variant: "ghost", children: [_jsx(FileText, {}), copy.openLogs] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: remoteReauth ? copy.remoteSignInHint : copy.repairHint })] }), logs.length > 0 ? (_jsxs("div", { className: "grid gap-2", children: [_jsx(Button, { className: "-ml-2 self-start font-medium", onClick: () => setShowLogs(v => !v), size: "xs", type: "button", variant: "text", children: showLogs ? copy.hideRecentLogs : copy.showRecentLogs }), showLogs ? _jsx(LogView, { className: "max-h-48", children: logs.slice(-40).join('') }) : null] })) : null] })] }) }));
}
