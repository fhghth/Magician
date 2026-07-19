import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ModelPickerDialog } from '@/components/model-picker';
import { Button } from '@/components/ui/button';
import { ErrorIcon } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { getGlobalModelOptions } from '@/hermes';
import { useI18n } from '@/i18n';
import { ExternalLink, Loader2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { cancelOnboardingFlow, copyDeviceCode, copyExternalCommand, recheckExternalSignin, setOnboardingCode, setOnboardingModel, submitOnboardingCode } from '@/store/onboarding';
import { DecodedLabel, GlyphText, HackeryButton, useScramble } from './glyph';
import { providerTitle } from './providers';
export function FlowPanel({ ctx, flow, leaving, onBegin }) {
    const { t } = useI18n();
    const title = 'provider' in flow && flow.provider ? providerTitle(flow.provider) : '';
    if (flow.status === 'starting') {
        return _jsx(Status, { children: t.onboarding.startingSignIn(title) });
    }
    if (flow.status === 'submitting') {
        return _jsx(Status, { children: t.onboarding.verifyingCode(title) });
    }
    if (flow.status === 'success') {
        return _jsx(DecodedLabel, { text: t.onboarding.connectedPicking(title) });
    }
    if (flow.status === 'confirming_model') {
        return _jsx(ConfirmingModelPanel, { flow: flow, leaving: leaving, onBegin: onBegin });
    }
    if (flow.status === 'error') {
        return (_jsxs("div", { className: "grid gap-3", children: [_jsxs("div", { className: "flex items-center gap-1.5 text-sm text-destructive", children: [_jsx(ErrorIcon, { className: "shrink-0", size: "0.875rem" }), _jsx("span", { children: flow.message || t.onboarding.signInFailed })] }), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { onClick: cancelOnboardingFlow, variant: "outline", children: t.onboarding.pickDifferentProvider }) })] }));
    }
    if (flow.status === 'awaiting_user') {
        return (_jsxs(Step, { title: t.onboarding.signInWith(title), children: [_jsxs("ol", { className: "list-decimal space-y-1 pl-5 text-sm text-muted-foreground", children: [_jsx("li", { children: t.onboarding.openedBrowser(title) }), _jsx("li", { children: t.onboarding.authorizeThere }), _jsx("li", { children: t.onboarding.copyAuthCode })] }), _jsx(Input, { autoFocus: true, onChange: e => setOnboardingCode(e.target.value), onKeyDown: e => e.key === 'Enter' && void submitOnboardingCode(ctx), placeholder: t.onboarding.pasteAuthCode, value: flow.code }), _jsxs(FlowFooter, { left: _jsx(DocsLink, { href: flow.start.auth_url, children: t.onboarding.reopenAuthPage }), children: [_jsx(CancelBtn, {}), _jsx(Button, { disabled: !flow.code.trim(), onClick: () => void submitOnboardingCode(ctx), children: t.common.continue })] })] }));
    }
    if (flow.status === 'external_pending') {
        return (_jsxs(Step, { title: t.onboarding.signInWith(title), children: [_jsx("p", { className: "text-sm text-muted-foreground", children: t.onboarding.externalPending(title) }), _jsx(CodeBlock, { copied: flow.copied, onCopy: () => void copyExternalCommand(), text: flow.provider.cli_command }), _jsxs(FlowFooter, { left: flow.provider.docs_url ? (_jsx(DocsLink, { href: flow.provider.docs_url, children: t.onboarding.docs(title) })) : null, children: [_jsx(CancelBtn, {}), _jsx(Button, { onClick: () => void recheckExternalSignin(ctx), children: t.onboarding.signedIn })] })] }));
    }
    if (flow.status !== 'polling') {
        return null;
    }
    return (_jsxs(Step, { title: t.onboarding.signInWith(title), children: [_jsx("p", { className: "text-sm text-muted-foreground", children: t.onboarding.deviceCodeOpened(title) }), _jsx(DeviceCode, { code: flow.start.user_code, copied: flow.copied, onCopy: () => void copyDeviceCode() }), _jsxs(FlowFooter, { left: _jsx(DocsLink, { href: flow.start.verification_url, children: t.onboarding.reopenVerification }), children: [_jsxs("span", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [_jsx(Loader2, { className: "size-3 animate-spin" }), t.onboarding.waitingAuthorize] }), _jsx(CancelBtn, { size: "sm" })] })] }));
}
function Step({ children, title }) {
    return (_jsxs("div", { className: "grid gap-4", children: [_jsx("h3", { className: "text-sm font-semibold", children: title }), children] }));
}
// Device-code display: OTP-style — each character in its own readonly cell.
// The whole row is the copy button (no side button, no checkmark); on copy the
// cells flash emerald for feedback. Dashes render as quiet separators.
function DeviceCode({ code, copied, onCopy }) {
    const { t } = useI18n();
    return (_jsx("button", { "aria-label": t.onboarding.copy, className: "group flex w-full items-center justify-center gap-1.5", onClick: onCopy, type: "button", children: [...code].map((ch, i) => ch === '-' || ch === ' ' ? (_jsx("span", { className: "w-1.5 text-center text-lg text-muted-foreground", children: "\u2013" }, i)) : (_jsx("span", { className: cn('flex size-10 items-center justify-center rounded-md border font-mono text-xl font-semibold uppercase transition-colors', copied
                ? 'border-primary/50 text-primary'
                : 'border-(--stroke-nous) text-foreground group-hover:border-(--ui-stroke-secondary)'), children: ch }, i))) }));
}
function CodeBlock({ copied, onCopy, text }) {
    const { t } = useI18n();
    return (_jsxs("div", { className: "flex items-center justify-between gap-3 rounded-md border border-(--stroke-nous) px-3 py-2", children: [_jsxs("code", { className: "min-w-0 flex-1 truncate font-mono text-sm", children: [_jsx("span", { className: "mr-2 select-none text-muted-foreground", children: "$" }), text] }), _jsx(Button, { onClick: onCopy, size: "sm", variant: "outline", children: copied ? t.common.copied : t.onboarding.copy })] }));
}
function FlowFooter({ children, left }) {
    return (_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("div", { className: "min-w-0", children: left }), _jsx("div", { className: "flex items-center gap-3", children: children })] }));
}
function CancelBtn({ size = 'default' }) {
    const { t } = useI18n();
    return (_jsx(Button, { onClick: cancelOnboardingFlow, size: size, variant: "ghost", children: t.common.cancel }));
}
function ConfirmingModelPanel({ flow, leaving, onBegin }) {
    const { t } = useI18n();
    const scrambledModel = useScramble(flow.currentModel, leaving);
    const scrambledBegin = useScramble(t.onboarding.startChatting, leaving);
    // Local state controls whether the model picker dialog is open.
    // We reuse the existing ModelPickerDialog component (the same picker
    // available from the chat shell) rather than building an inline
    // dropdown — gives us search, multi-provider listing if relevant, and
    // a familiar UI for users who'll see this picker again later.
    const [pickerOpen, setPickerOpen] = useState(false);
    // Pull pricing + tier for the just-picked default so the confirm card
    // shows the same $/Mtok + Free/Pro info the picker and CLI do.
    const options = useQuery({
        queryKey: ['onboarding-model-options', flow.providerSlug],
        queryFn: () => getGlobalModelOptions({ includeUnconfigured: true, explicitOnly: false })
    });
    const providerRow = options.data?.providers?.find(p => String(p.slug).toLowerCase() === flow.providerSlug.toLowerCase());
    const price = providerRow?.pricing?.[flow.currentModel];
    const freeTier = providerRow?.free_tier;
    return (_jsxs("div", { className: "grid place-items-center gap-7 py-6 text-center", children: [_jsx(DecodedLabel, { leaving: leaving, text: t.onboarding.connectedProvider(flow.label) }), _jsxs("div", { className: cn('grid justify-items-center gap-1.5 transition duration-[360ms] ease-out', leaving ? 'opacity-0 saturate-0' : 'opacity-100 saturate-100'), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground", children: t.onboarding.defaultModel }), freeTier === true && (_jsx("span", { className: "rounded-sm bg-emerald-500/15 px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400", children: t.onboarding.freeTier })), freeTier === false && (_jsx("span", { className: "rounded-sm bg-primary/15 px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-primary", children: t.onboarding.pro }))] }), _jsx("p", { className: "font-mono text-base", children: _jsx(GlyphText, { text: scrambledModel }) }), price && (price.input || price.output) && (_jsx("p", { className: "font-mono text-xs text-muted-foreground", children: price.free ? t.onboarding.free : t.onboarding.price(price.input || '?', price.output || '?') })), _jsx(Button, { className: "mt-0.5 text-xs", disabled: flow.saving, onClick: () => setPickerOpen(true), size: "inline", variant: "text", children: t.onboarding.change })] }), _jsx("div", { className: cn('transition duration-[360ms] ease-out', leaving ? 'opacity-0 saturate-0' : 'opacity-100 saturate-100'), children: _jsx(HackeryButton, { disabled: flow.saving, label: _jsx(GlyphText, { text: scrambledBegin }), loading: flow.saving, onClick: onBegin }) }), _jsx(ModelPickerDialog, { contentClassName: "z-[1310]", currentModel: flow.currentModel, currentProvider: flow.providerSlug, onOpenChange: setPickerOpen, onSelect: ({ model }) => {
                    void setOnboardingModel(model);
                    setPickerOpen(false);
                }, open: pickerOpen })] }));
}
export function DocsLink({ children, href }) {
    return (_jsx(Button, { asChild: true, size: "xs", variant: "text", children: _jsxs("a", { href: href, rel: "noreferrer", target: "_blank", children: [_jsx(ExternalLink, { className: "size-3" }), children] }) }));
}
export function Status({ children }) {
    return (_jsxs("div", { className: "flex items-center gap-2.5 py-1 text-sm text-muted-foreground", role: "status", children: [_jsx(Loader, { className: "size-7", type: "lemniscate-bloom" }), children] }));
}
