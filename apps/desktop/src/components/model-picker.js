import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { requestModelOptions } from '@/lib/model-options';
import { currentPickerSelection } from '@/lib/model-status-label';
import { normalize } from '@/lib/text';
import { cn } from '../lib/utils';
import { startManualOnboarding } from '../store/onboarding';
import { InlineNotice } from './notifications';
import { Button } from './ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Skeleton } from './ui/skeleton';
export function ModelPickerDialog({ open, onOpenChange, gw, sessionId, currentModel, currentProvider, onSelect, contentClassName }) {
    const { t } = useI18n();
    const copy = t.modelPicker;
    // Own the search term so we can filter manually. cmdk's built-in
    // shouldFilter reorders items by its fuzzy-match score (≈alphabetical with
    // an empty query), which destroys the backend's curated order. We disable
    // it and do a plain substring filter that preserves array order — matching
    // the `hermes model` CLI picker, which shows the curated list verbatim.
    const [search, setSearch] = useState('');
    const modelOptions = useQuery({
        queryKey: ['model-options', sessionId || 'global'],
        queryFn: () => requestModelOptions({ gateway: gw, sessionId }),
        enabled: open
    });
    const providers = modelOptions.data?.providers ?? [];
    const { model: optionsModel, provider: optionsProvider } = currentPickerSelection(!!sessionId, { model: currentModel, provider: currentProvider }, modelOptions.data);
    const loading = modelOptions.isPending && !modelOptions.data;
    const error = modelOptions.error
        ? modelOptions.error instanceof Error
            ? modelOptions.error.message
            : String(modelOptions.error)
        : null;
    const selectModel = (provider, model) => {
        onSelect({ provider: provider.slug, model });
        onOpenChange(false);
    };
    // Open the full onboarding provider selector to add/switch a provider.
    // Reuses the entire onboarding flow (OAuth rows, API-key form, device-code,
    // model-confirm) instead of duplicating provider UI here. Closes the picker
    // so the onboarding overlay (z-1300) isn't rendered underneath it.
    const addProvider = () => {
        startManualOnboarding();
        onOpenChange(false);
    };
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogContent, { className: cn('max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0', contentClassName), children: [_jsxs(DialogHeader, { className: "border-b border-border px-4 py-3", children: [_jsx(DialogTitle, { children: copy.title }), _jsxs(DialogDescription, { className: "font-mono text-xs leading-relaxed", children: [copy.current, " ", optionsModel || currentModel || copy.unknown, optionsProvider || currentProvider ? ` · ${optionsProvider || currentProvider}` : ''] })] }), _jsxs(Command, { className: "rounded-none bg-card", shouldFilter: false, children: [_jsx(CommandInput, { autoFocus: true, onValueChange: setSearch, placeholder: copy.search, value: search }), _jsxs(CommandList, { className: "max-h-96", children: [!loading && !error && _jsx(CommandEmpty, { children: copy.noModels }), _jsx(ModelResults, { currentModel: optionsModel || currentModel, currentProvider: optionsProvider || currentProvider, error: error, loading: loading, onSelectModel: selectModel, providers: providers, search: search })] })] }), _jsxs(DialogFooter, { className: "flex-row items-center justify-end gap-2 bg-card p-3", children: [_jsx(Button, { onClick: addProvider, variant: "ghost", children: copy.addProvider }), _jsx(Button, { onClick: () => onOpenChange(false), variant: "outline", children: t.common.cancel })] })] }) }));
}
function ModelResults({ loading, error, providers, currentModel, currentProvider, onSelectModel, search }) {
    const { t } = useI18n();
    const copy = t.modelPicker;
    if (loading) {
        return _jsx(LoadingResults, {});
    }
    if (error) {
        return (_jsx("div", { className: "px-3 py-3", children: _jsx(InlineNotice, { kind: "error", title: copy.loadFailed, children: error }) }));
    }
    if (providers.length === 0) {
        return _jsx("div", { className: "px-4 py-6 text-sm text-muted-foreground", children: copy.noAuthenticatedProviders });
    }
    const q = normalize(search);
    const matches = (provider, model) => !q ||
        model.toLowerCase().includes(q) ||
        provider.name.toLowerCase().includes(q) ||
        provider.slug.toLowerCase().includes(q);
    // Only configured providers (those with curated models) are selectable
    // here. Switching to a NOT-yet-configured provider goes through the
    // "Add provider" footer button, which opens the full onboarding selector.
    const configured = providers.filter(p => (p.models ?? []).length > 0);
    return (_jsx(_Fragment, { children: configured.map(provider => {
            // Preserve the backend's curated order — filter in place, no re-sort.
            const models = (provider.models ?? []).filter(m => matches(provider, m));
            if (models.length === 0) {
                return null;
            }
            const unavailable = new Set(provider.unavailable_models ?? []);
            return (_jsxs(CommandGroup, { heading: _jsx(ProviderHeading, { provider: provider }), children: [provider.warning && (_jsx("div", { className: "px-2 pb-2", children: _jsx(InlineNotice, { className: "px-2.5 py-1.5 text-xs", kind: "warning", children: provider.warning }) })), models.map(model => {
                        const isCurrent = model === currentModel && provider.slug === currentProvider;
                        const price = provider.pricing?.[model];
                        const locked = unavailable.has(model);
                        return (_jsxs(CommandItem, { className: cn('flex items-center gap-2 pl-6 font-mono', isCurrent &&
                                'bg-primary text-primary-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground', locked && 'cursor-not-allowed opacity-45'), disabled: locked, onSelect: () => {
                                if (!locked) {
                                    onSelectModel(provider, model);
                                }
                            }, value: `${provider.slug}:${model}`, children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: model }), locked && (_jsx("span", { className: "shrink-0 text-[0.62rem] uppercase tracking-wide opacity-80", children: copy.pro })), _jsx(ModelPrice, { isCurrent: isCurrent, price: price })] }, `${provider.slug}:${model}`));
                    }), unavailable.size > 0 && (_jsx("div", { className: "px-6 pb-2 pt-1 text-[0.62rem] leading-relaxed text-muted-foreground", children: copy.proNeedsSubscription }))] }, provider.slug));
        }) }));
}
// Compact In/Out $/Mtok price tag, mirroring the CLI picker's price columns.
// Renders nothing when pricing is unavailable for the model.
function ModelPrice({ price, isCurrent }) {
    const { t } = useI18n();
    const copy = t.modelPicker;
    if (!price || (!price.input && !price.output)) {
        return null;
    }
    if (price.free) {
        return (_jsx("span", { className: cn('shrink-0 rounded-sm px-1 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide', isCurrent ? 'bg-primary-foreground/20' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'), children: copy.free }));
    }
    return (_jsxs("span", { className: cn('shrink-0 text-[0.66rem] tabular-nums', isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'), title: copy.priceTitle, children: [price.input || '?', " / ", price.output || '?'] }));
}
function LoadingResults() {
    return (_jsx(CommandGroup, { heading: _jsx(Skeleton, { className: "h-3 w-32" }), children: Array.from({ length: 4 }, (_, rowIndex) => (_jsx("div", { className: "rounded-sm py-1.5 pl-6 pr-2", children: _jsx(Skeleton, { className: cn('h-5', rowIndex % 3 === 0 ? 'w-3/5' : rowIndex % 3 === 1 ? 'w-4/5' : 'w-1/2') }) }, rowIndex))) }));
}
function ProviderHeading({ provider }) {
    const { t } = useI18n();
    const copy = t.modelPicker;
    // free_tier is only set for Nous. true → "Free tier", false → "Pro".
    const tierBadge = provider.free_tier === true ? (_jsx("span", { className: "rounded-sm bg-emerald-500/15 px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400", children: copy.freeTier })) : provider.free_tier === false ? (_jsx("span", { className: "rounded-sm bg-primary/15 px-1 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-primary", children: copy.pro })) : null;
    return (_jsxs("span", { className: "flex min-w-0 items-center gap-2", children: [_jsx("span", { className: "truncate", children: provider.name }), _jsxs("span", { className: "font-mono text-xs font-normal normal-case tracking-normal text-muted-foreground", children: [provider.slug, " \u00B7 ", provider.total_models ?? provider.models?.length ?? 0] }), tierBadge] }));
}
