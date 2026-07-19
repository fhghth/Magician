import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { RowButton } from '@/components/ui/row-button';
import { useI18n } from '@/i18n';
import { Check, ChevronRight, Terminal } from '@/lib/icons';
const PROVIDER_DISPLAY = {
    nous: { order: 0, title: 'Nous Portal' },
    'openai-codex': { order: 1, title: 'OpenAI OAuth (ChatGPT)' },
    'minimax-oauth': { order: 2, title: 'MiniMax' },
    'qwen-oauth': { order: 3, title: 'Qwen Code' },
    'xai-oauth': { order: 4, title: 'xAI Grok' },
    // Both Anthropic entries sit at the bottom: the API-key path first, then
    // the subscription OAuth path (only works with extra usage credits).
    anthropic: { order: 5, title: 'Anthropic API Key' },
    'claude-code': { order: 6, title: 'Anthropic OAuth: Required Extra Usage Credits to Use Subscription' }
};
const assetPath = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
export const providerTitle = (p) => PROVIDER_DISPLAY[p.id]?.title ?? p.name;
const orderOf = (p) => PROVIDER_DISPLAY[p.id]?.order ?? 99;
export const sortProviders = (providers) => [...providers].sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name));
export function FeaturedProviderRow({ onSelect, provider }) {
    const { t } = useI18n();
    const loggedIn = provider.status?.logged_in;
    return (_jsxs("button", { className: "group relative flex w-full items-center justify-between gap-4 rounded-[8px] bg-primary/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-primary/10", onClick: () => onSelect(provider), type: "button", children: [_jsx("span", { "aria-hidden": true, className: "arc-border arc-reverse arc-nous" }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { alt: "", className: "size-5 shrink-0 rounded", src: assetPath('apple-touch-icon.png') }), _jsx("span", { className: "text-[length:var(--conversation-text-font-size)] font-semibold", children: providerTitle(provider) }), loggedIn ? (_jsx(ConnectedTag, {})) : (_jsxs("span", { className: "inline-flex items-center gap-1.5 bg-primary px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground", children: [_jsx("span", { "aria-hidden": "true", className: "dither inline-block size-2 shrink-0" }), t.onboarding.recommended] }))] }), _jsx("p", { className: "mt-1 text-xs leading-5 text-muted-foreground", children: t.onboarding.featuredPitch })] }), _jsx(ChevronRight, { className: "size-4 shrink-0 text-primary transition group-hover:translate-x-0.5" })] }));
}
function ConnectedTag() {
    const { t } = useI18n();
    return (_jsxs("span", { className: "inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary", children: [_jsx(Check, { className: "size-3" }), t.onboarding.connected] }));
}
const PROVIDER_ROW_CLASS = 'group flex w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left transition-colors hover:bg-(--ui-control-hover-background)';
export function KeyProviderRow({ onClick }) {
    const { t } = useI18n();
    return (_jsxs(RowButton, { className: PROVIDER_ROW_CLASS, onClick: onClick, children: [_jsxs("div", { className: "min-w-0", children: [_jsx("span", { className: "text-[length:var(--conversation-text-font-size)] font-semibold", children: "OpenRouter" }), _jsx("p", { className: "mt-1 text-xs leading-5 text-muted-foreground", children: t.onboarding.openRouterPitch })] }), _jsx(ChevronRight, { className: "size-4 text-muted-foreground transition group-hover:text-foreground" })] }));
}
export function ProviderRow({ onSelect, provider }) {
    const { t } = useI18n();
    const loggedIn = provider.status?.logged_in;
    const Trail = provider.flow === 'external' ? Terminal : ChevronRight;
    return (_jsxs(RowButton, { className: PROVIDER_ROW_CLASS, onClick: () => onSelect(provider), children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-[length:var(--conversation-text-font-size)] font-semibold", children: providerTitle(provider) }), loggedIn ? _jsx(ConnectedTag, {}) : null] }), _jsx("p", { className: "mt-1 text-xs leading-5 text-muted-foreground", children: t.onboarding.flowSubtitles[provider.flow] })] }), _jsx(Trail, { className: "size-4 text-muted-foreground transition group-hover:text-foreground" })] }));
}
