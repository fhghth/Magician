import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Input } from '@/components/ui/input';
import { getGlobalModelOptions } from '@/hermes';
import { useI18n } from '@/i18n';
import { Check, ChevronDown, ChevronLeft, KeyRound, Loader2 } from '@/lib/icons';
import { isProviderSetupErrorMessage } from '@/lib/provider-setup-errors';
import { cn } from '@/lib/utils';
import { $desktopBoot } from '@/store/boot';
import { $desktopOnboarding, clearPendingProviderOAuth, closeManualOnboarding, confirmOnboardingModel, DEFAULT_MANUAL_ONBOARDING_REASON, DEFAULT_ONBOARDING_REASON, dismissFirstRunOnboarding, peekPendingProviderOAuth, refreshOnboarding, saveOnboardingApiKey, setOnboardingMode, startProviderOAuth } from '@/store/onboarding';
import { DocsLink, FlowPanel, Status } from './flow';
import { FeaturedProviderRow, KeyProviderRow, ProviderRow, sortProviders } from './providers';
export { FeaturedProviderRow, KeyProviderRow, ProviderRow, providerTitle, sortProviders } from './providers';
const API_KEY_OPTIONS = [
    {
        id: 'openrouter',
        name: 'OpenRouter',
        envKey: 'OPENROUTER_API_KEY',
        docsUrl: 'https://openrouter.ai/keys'
    },
    {
        id: 'openai',
        name: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        docsUrl: 'https://platform.openai.com/api-keys'
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        envKey: 'GEMINI_API_KEY',
        docsUrl: 'https://aistudio.google.com/app/apikey'
    },
    {
        id: 'xai',
        name: 'xAI Grok',
        envKey: 'XAI_API_KEY',
        docsUrl: 'https://console.x.ai/'
    },
    {
        id: 'local',
        name: 'Local / custom endpoint',
        envKey: 'OPENAI_BASE_URL',
        docsUrl: 'https://github.com/NousResearch/hermes-agent#bring-your-own-endpoint',
        placeholder: 'http://127.0.0.1:8000/v1'
    }
];
// Build the FULL API-key provider catalog from the backend model options so the
// onboarding / Providers key form lists every `api_key` provider `hermes model`
// knows about — not just the hand-curated five. Curated entries keep their
// richer copy + placeholders and float to the top (recommended defaults); every
// other api_key provider is appended with a generic "paste {KEY}" affordance.
// OAuth / external providers are intentionally excluded here — they go through
// the OAuth picker / sign-in flow, not a pasted key.
function useApiKeyCatalog() {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        let cancelled = false;
        // Best-effort — on failure the curated defaults still render. Wrapped in
        // Promise.resolve().then so a synchronous throw (e.g. no desktop bridge in
        // tests) is funneled into the same .catch instead of escaping.
        void Promise.resolve()
            .then(() => getGlobalModelOptions({ includeUnconfigured: true, explicitOnly: false }))
            .then(res => {
            if (!cancelled) {
                setRows(res.providers ?? []);
            }
        })
            .catch(() => {
            // Ignore — fall back to the curated API_KEY_OPTIONS only.
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return useMemo(() => {
        const curatedByEnv = new Map(API_KEY_OPTIONS.map(o => [o.envKey, o]));
        const derived = [];
        const seenEnv = new Set(API_KEY_OPTIONS.map(o => o.envKey));
        for (const row of rows) {
            // Only api_key providers can be activated with a pasted key. Skip OAuth /
            // external / managed flows and anything missing an env var to write to.
            if (row.auth_type && row.auth_type !== 'api_key') {
                continue;
            }
            const envKey = row.key_env;
            if (!envKey || seenEnv.has(envKey)) {
                continue;
            }
            seenEnv.add(envKey);
            derived.push({
                id: row.slug,
                name: row.name,
                envKey,
                description: `Direct API access to ${row.name}.`,
                docsUrl: ''
            });
        }
        // Curated first (recommended order), then the rest alphabetically so the
        // long tail is scannable.
        derived.sort((a, b) => a.name.localeCompare(b.name));
        return [...API_KEY_OPTIONS.filter(o => curatedByEnv.has(o.envKey)), ...derived];
    }, [rows]);
}
// Exit choreography, mirroring the gateway "connecting" overlay's timing:
// text-out (360ms: CONNECTED fades down, rest scrambles+fades) → hold (300ms)
// → surface-out (520ms, held back by [transition-delay:660ms]). Finalize after.
const ONBOARDING_EXIT_MS = 1180;
export function DesktopOnboardingOverlay({ enabled, onCompleted, requestGateway }) {
    const { t } = useI18n();
    const onboarding = useStore($desktopOnboarding);
    const boot = useStore($desktopBoot);
    const ctxRef = useRef({ requestGateway, onCompleted });
    ctxRef.current = { requestGateway, onCompleted };
    const ctx = useMemo(() => ({
        requestGateway: (...args) => ctxRef.current.requestGateway(...args),
        onCompleted: () => ctxRef.current.onCompleted?.()
    }), []);
    // Cinematic exit on "Begin": dissolve the panel + overlay (revealing the chat
    // behind), THEN finalize so the unmount lands after the fade — mirrors the
    // connecting overlay's exit choreography instead of cutting instantly.
    const [leaving, setLeaving] = useState(false);
    const finalizeOnboarding = () => {
        if (leaving) {
            return;
        }
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            confirmOnboardingModel(ctx);
            return;
        }
        setLeaving(true);
        window.setTimeout(() => confirmOnboardingModel(ctx), ONBOARDING_EXIT_MS);
    };
    useEffect(() => {
        if (enabled || onboarding.requested) {
            void refreshOnboarding(ctx);
        }
    }, [ctx, enabled, onboarding.requested]);
    // When the Providers settings page asked to connect a specific provider, the
    // store stashed its id. Once the provider list has loaded and we're back at
    // an idle picker, launch that exact OAuth flow so the user lands directly in
    // sign-in instead of the picker they just came from.
    useEffect(() => {
        if (!onboarding.manual || onboarding.providers === null || onboarding.flow.status !== 'idle') {
            return;
        }
        const pendingId = peekPendingProviderOAuth();
        if (!pendingId) {
            return;
        }
        const provider = onboarding.providers.find(p => p.id === pendingId);
        if (provider) {
            // Only clear once we've committed to launching it, so a failed/empty
            // provider fetch doesn't silently drop the hand-off.
            clearPendingProviderOAuth();
            void startProviderOAuth(provider, ctx);
        }
        else if (onboarding.providers.length > 0) {
            // The list loaded but the id isn't a real provider — drop the stale
            // hand-off. An empty list means the fetch isn't ready yet, so keep it
            // and let a later refresh retry.
            clearPendingProviderOAuth();
        }
    }, [ctx, onboarding.flow.status, onboarding.manual, onboarding.providers]);
    // Mount from frame 1 so we replace the boot overlay seamlessly. The
    // configured field stays null until the runtime check resolves; only then
    // do we know whether to dismiss (true) or surface the picker (false).
    // EXCEPTION: manual mode (user opened the selector from a working app to
    // add/switch a provider) shows the overlay regardless of configured state.
    if (onboarding.configured === true && !onboarding.manual) {
        return null;
    }
    // The user chose "I'll choose a provider later" on first run. Stay out of the
    // way on every subsequent launch — they re-enter via Settings → Providers
    // (manual mode), which sets manual=true and bypasses this gate.
    if (onboarding.firstRunSkipped && !onboarding.manual) {
        return null;
    }
    const { flow } = onboarding;
    // Show the launch reason only when it's a meaningful, caller-supplied prompt —
    // suppress the generic defaults (useless noise) and provider-setup errors
    // (those are surfaced by FlowPanel, not as a banner).
    const rawReason = onboarding.reason?.trim() || null;
    const reason = rawReason &&
        !isProviderSetupErrorMessage(rawReason) &&
        rawReason !== DEFAULT_ONBOARDING_REASON &&
        rawReason !== DEFAULT_MANUAL_ONBOARDING_REASON
        ? rawReason
        : null;
    // In manual mode the app is already configured, so the flow is "ready"
    // immediately — no runtime gate needed. Otherwise wait for the readiness
    // check (configured === false) before showing the picker.
    const ready = onboarding.manual || (enabled && onboarding.configured === false);
    const showPicker = flow.status === 'idle' || flow.status === 'success';
    // The final "you're in" screen drops the card chrome and floats centered on
    // the surface — same bare, cinematic treatment as the connecting overlay.
    const bare = ready && !showPicker && flow.status === 'confirming_model';
    return (_jsx("div", { className: cn('fixed inset-0 z-1300 flex items-center justify-center bg-(--ui-chat-surface-background) p-6 transition-opacity duration-[520ms] ease-out', 
        // On the bare confirm screen, hold the surface (text-out + hold) so the
        // per-element exit plays before it dissolves.
        bare && leaving ? '[transition-delay:660ms]' : '', leaving ? 'pointer-events-none opacity-0' : 'opacity-100'), children: _jsxs("div", { className: cn('relative w-full max-w-[45rem] transition-all duration-500 ease-out', bare
                ? ''
                : 'overflow-hidden rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) shadow-nous', 
            // Bare confirm screen orchestrates its own per-element exit; the
            // carded states use the simple lift/blur dissolve.
            leaving && !bare
                ? '-translate-y-1 scale-[0.985] opacity-0 blur-[2px]'
                : 'translate-y-0 scale-100 opacity-100 blur-0'), children: [showPicker || !ready ? _jsx(Header, {}) : null, onboarding.manual ? (_jsx(Button, { "aria-label": t.common.close, className: "absolute right-3 top-3 z-10 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground", onClick: () => closeManualOnboarding(), size: "icon-sm", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "1rem" }) })) : null, _jsxs("div", { className: "grid gap-3 p-5", children: [reason ? _jsx(ReasonNotice, { reason: reason }) : null, ready ? (showPicker ? (_jsx(Picker, { ctx: ctx })) : (_jsx(FlowPanel, { ctx: ctx, flow: flow, leaving: leaving, onBegin: finalizeOnboarding }))) : (_jsx(Preparing, { boot: boot }))] })] }) }));
}
// The launch reason is a prompt ("why am I seeing this"), not an error. Only
// rendered for meaningful caller-supplied reasons (defaults are filtered out
// upstream), so it never shows the generic "no provider configured" noise.
function ReasonNotice({ reason }) {
    return (_jsx("div", { className: "rounded-2xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary)/40 px-4 py-3 text-sm text-muted-foreground", children: reason }));
}
function Preparing({ boot }) {
    const { t } = useI18n();
    const progress = Math.max(2, Math.min(100, Math.round(boot.progress)));
    const hasError = Boolean(boot.error);
    const installing = boot.phase.startsWith('runtime.');
    return (_jsxs("div", { className: "grid gap-3", role: "status", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: installing ? t.onboarding.preparingInstall : t.onboarding.starting }), _jsx("div", { className: "h-2 overflow-hidden rounded-full bg-muted", children: _jsx("div", { className: cn('h-full rounded-full bg-primary transition-[width] duration-300 ease-out', hasError && 'bg-destructive'), style: { width: `${progress}%` } }) }), _jsxs("div", { className: "flex items-center justify-between gap-3 text-xs text-muted-foreground", children: [_jsx("span", { className: "truncate", children: boot.message }), _jsxs("span", { children: [progress, "%"] })] }), hasError ? _jsx("p", { className: "text-xs text-destructive", children: boot.error }) : null] }));
}
function Header() {
    const { t } = useI18n();
    return (_jsxs("div", { className: "bg-(--ui-chat-bubble-background) px-5 pt-5 pb-1", children: [_jsx("h2", { className: "text-[0.9375rem] font-semibold tracking-tight", children: t.onboarding.headerTitle }), _jsx("p", { className: "mt-1 max-w-xl text-[0.8125rem] leading-5 text-(--ui-text-tertiary)", children: t.onboarding.headerDesc })] }));
}
export const FEATURED_ID = 'nous';
const SHOW_ALL_KEY = 'hermes-onboarding-show-all-v1';
const readShowAll = () => {
    try {
        return window.localStorage.getItem(SHOW_ALL_KEY) === '1';
    }
    catch {
        return false;
    }
};
const persistShowAll = (value) => {
    try {
        window.localStorage.setItem(SHOW_ALL_KEY, value ? '1' : '0');
    }
    catch {
        // localStorage unavailable — degrade silently.
    }
    return value;
};
export function Picker({ ctx }) {
    const { t } = useI18n();
    const { localEndpoint, manual, mode, providers } = useStore($desktopOnboarding);
    const [showAll, setShowAll] = useState(readShowAll);
    const ordered = useMemo(() => (providers ? sortProviders(providers) : []), [providers]);
    const hasOauth = ordered.length > 0;
    const apiKeyOptions = useApiKeyCatalog();
    // localEndpoint forces the key form regardless of `mode` (which a manual
    // provider refresh may flip back to 'oauth'); it preselects the local option
    // and hides the "back to sign in" link since the user came specifically to
    // configure a custom endpoint.
    if (localEndpoint || mode === 'apikey' || !hasOauth) {
        return (_jsxs("div", { className: "grid gap-3", children: [_jsx(ApiKeyForm, { canGoBack: hasOauth && !localEndpoint, initialEnvKey: localEndpoint ? 'OPENAI_BASE_URL' : undefined, onBack: () => setOnboardingMode('oauth'), onSave: (envKey, value, name, apiKey) => saveOnboardingApiKey(envKey, value, name, ctx, apiKey), options: apiKeyOptions }), manual ? null : (_jsx("div", { className: "flex justify-center pt-1", children: _jsx(ChooseLaterLink, {}) }))] }));
    }
    if (providers === null) {
        return _jsx(Status, { children: t.onboarding.lookingUpProviders });
    }
    const select = (p) => void startProviderOAuth(p, ctx);
    const featured = ordered.find(p => p.id === FEATURED_ID) ?? null;
    const rest = featured ? ordered.filter(p => p.id !== FEATURED_ID) : ordered;
    // Collapse the secondary providers behind a disclosure only when Nous
    // Portal is present to anchor the choice — otherwise show the full list.
    const collapsible = Boolean(featured) && rest.length > 0;
    const showRest = !collapsible || showAll;
    return (_jsxs("div", { className: "grid gap-2", children: [_jsxs("div", { className: "grid max-h-[60dvh] gap-2 overflow-y-auto p-1", children: [featured ? _jsx(FeaturedProviderRow, { onSelect: select, provider: featured }) : null, showRest ? (_jsxs(_Fragment, { children: [rest.map(p => (_jsx(ProviderRow, { onSelect: select, provider: p }, p.id))), _jsx(KeyProviderRow, { onClick: () => setOnboardingMode('apikey') })] })) : null] }), collapsible ? (_jsxs(Button, { className: "mt-1 self-center font-medium", onClick: () => setShowAll(persistShowAll(!showAll)), size: "xs", type: "button", variant: "text", children: [showAll ? t.onboarding.collapse : t.onboarding.otherProviders, _jsx(ChevronDown, { className: cn('size-3.5 transition', showAll && 'rotate-180') })] })) : null, _jsxs("div", { className: "flex items-center justify-between gap-3 pt-1", children: [manual ? _jsx("span", {}) : _jsx(ChooseLaterLink, {}), _jsx(Button, { className: "-mr-2 font-medium", onClick: () => setOnboardingMode('apikey'), size: "xs", type: "button", variant: "text", children: t.onboarding.haveApiKey })] })] }));
}
// "I'll choose a provider later" — dismisses the first-run picker and persists
// the skip so it never re-nags. The user connects a provider any time from
// Settings → Providers. Rendered only on the unconfigured first-run flow.
function ChooseLaterLink() {
    const { t } = useI18n();
    return (_jsx(Button, { className: "font-medium", onClick: () => dismissFirstRunOnboarding(), size: "xs", type: "button", variant: "text", children: t.onboarding.chooseLater }));
}
// Presentational two-column key picker. Onboarding feeds it its curated
// options + a ctx-bound save; the Providers settings page feeds it the full
// provider catalog + a setEnvVar-backed save (plus `isSet`/`onClear` so it can
// double as a manage surface). Keep it free of store/ctx coupling so both
// surfaces render the identical form.
export function ApiKeyForm({ canGoBack, initialEnvKey, isSet, onBack, onClear, onSave, options = API_KEY_OPTIONS, redactedValue }) {
    const { t } = useI18n();
    const [option, setOption] = useState(() => options.find(o => o.envKey === initialEnvKey) ?? options[0]);
    const [value, setValue] = useState('');
    // Optional endpoint API key, only used by the local / custom endpoint option
    // (whose `value` is the base URL). Cleared whenever the option changes.
    const [localKey, setLocalKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // `options` can change at runtime when callers filter the catalog (e.g. the
    // Providers page wiring its search into this grid). Keep the selection valid
    // by snapping back to the first remaining option when the current one drops.
    useEffect(() => {
        if (options.length > 0 && !options.some(o => o.envKey === option.envKey)) {
            setOption(options[0]);
            setValue('');
            setLocalKey('');
            setError(null);
        }
    }, [option.envKey, options]);
    // The catalog grid can be tall, leaving the entry field far below the fold.
    // On selection we scroll the field into view and focus it so it's always
    // obvious where to paste next.
    const entryRef = useRef(null);
    const pick = (o) => {
        setOption(o);
        setValue('');
        setLocalKey('');
        setError(null);
        requestAnimationFrame(() => {
            entryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            entryRef.current?.querySelector('input')?.focus();
        });
    };
    const isLocal = option.envKey === 'OPENAI_BASE_URL';
    const alreadySet = isSet?.(option.envKey) ?? false;
    // When set, surface the backend's redacted value (e.g. "sk-12…wxyz") as the
    // placeholder so users can eyeball that the right key is in place.
    const currentRedacted = alreadySet ? (redactedValue?.(option.envKey) ?? null) : null;
    // Only require a non-empty value — no length/format validation, so a short
    // or unusual key can't block the user from continuing.
    const canSave = value.trim().length >= 1;
    const optionCopy = t.onboarding.apiKeyOptions[option.id];
    const optionDescription = optionCopy?.description ?? option.description;
    const submit = async () => {
        if (!canSave || saving) {
            return;
        }
        setSaving(true);
        setError(null);
        const result = await onSave(option.envKey, value, option.name, isLocal ? localKey : undefined);
        if (result.ok) {
            setValue('');
            setLocalKey('');
        }
        else {
            setError(result.message ?? t.onboarding.couldNotSave);
        }
        setSaving(false);
    };
    return (_jsxs("div", { className: "grid gap-4", children: [canGoBack ? (_jsxs(Button, { className: "-mt-1 self-start font-medium", onClick: onBack, size: "xs", type: "button", variant: "text", children: [_jsx(ChevronLeft, { className: "size-3" }), t.onboarding.backToSignIn] })) : null, _jsx("div", { className: "grid max-h-[42dvh] gap-2 overflow-y-auto p-1 sm:grid-cols-2", children: options.map(o => (_jsxs("button", { className: cn('rounded-2xl border bg-background/60 p-3 text-left transition hover:bg-accent/50', option.envKey === o.envKey ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'), onClick: () => pick(o), type: "button", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-sm font-medium", children: o.name }), isSet?.(o.envKey) ? _jsx(Check, { className: "size-3.5 text-muted-foreground" }) : null] }), (t.onboarding.apiKeyOptions[o.id]?.short ?? o.short) ? (_jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: t.onboarding.apiKeyOptions[o.id]?.short ?? o.short })) : null] }, o.envKey))) }), _jsxs("div", { className: "grid scroll-mt-4 gap-2", ref: entryRef, children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("p", { className: "text-sm leading-6 text-muted-foreground", children: optionDescription }), option.docsUrl ? _jsx(DocsLink, { href: option.docsUrl, children: t.onboarding.getKey }) : null] }), _jsx(Input, { autoComplete: "off", autoFocus: true, className: "font-mono", onChange: e => setValue(e.target.value), onKeyDown: e => e.key === 'Enter' && void submit(), placeholder: currentRedacted ??
                            (alreadySet ? t.onboarding.replaceCurrent : option.placeholder || t.onboarding.pasteApiKey), type: isLocal ? 'text' : 'password', value: value }), isLocal ? (_jsx(Input, { autoComplete: "off", className: "font-mono", onChange: e => setLocalKey(e.target.value), onKeyDown: e => e.key === 'Enter' && void submit(), placeholder: t.onboarding.localApiKeyPlaceholder, type: "password", value: localKey })) : null, error ? _jsx("p", { className: "text-xs text-destructive", children: error }) : null] }), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("div", { children: alreadySet && onClear ? (_jsx(Button, { onClick: () => onClear(option.envKey), size: "sm", variant: "ghost", children: t.common.remove })) : null }), _jsxs(Button, { disabled: !canSave || saving, onClick: () => void submit(), children: [saving ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(KeyRound, {}), saving ? t.onboarding.connecting : alreadySet ? t.onboarding.update : t.common.connect] })] })] }));
}
