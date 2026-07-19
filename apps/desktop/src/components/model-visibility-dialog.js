import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { Switch } from '@/components/ui/switch';
import { getGlobalModelOptions } from '@/hermes';
import { useI18n } from '@/i18n';
import { displayModelName, modelDisplayParts } from '@/lib/model-status-label';
import { normalize } from '@/lib/text';
import { $visibleModels, collapseModelFamilies, effectiveVisibleKeys, modelVisibilityKey, setVisibleModels, toggleModelVisibility } from '@/store/model-visibility';
export function ModelVisibilityDialog({ gw, onOpenChange, onOpenProviders, open, sessionId }) {
    const { t } = useI18n();
    const copy = t.modelVisibility;
    const [search, setSearch] = useState('');
    const stored = useStore($visibleModels);
    const modelOptions = useQuery({
        queryKey: ['model-options', sessionId || 'global'],
        queryFn: () => {
            if (gw && sessionId) {
                return gw.request('model.options', {
                    session_id: sessionId,
                    explicit_only: true
                });
            }
            return getGlobalModelOptions();
        },
        enabled: open
    });
    const providers = useMemo(() => (modelOptions.data?.providers ?? []).filter(provider => (provider.models ?? []).length > 0), [modelOptions.data]);
    const visible = effectiveVisibleKeys(stored, providers);
    const toggle = (provider, model) => {
        setVisibleModels(toggleModelVisibility($visibleModels.get(), providers, provider.slug, model));
    };
    const q = normalize(search);
    const matches = (provider, model) => !q || `${model} ${provider.name} ${provider.slug} ${displayModelName(model)}`.toLowerCase().includes(q);
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogContent, { className: "max-w-xs gap-0 overflow-hidden p-0", children: [_jsx(DialogHeader, { className: "px-3 pb-1 pt-3", children: _jsx(DialogTitle, { className: "text-[0.8125rem]", children: copy.title }) }), _jsx("div", { className: "px-3 py-1.5", children: _jsx("input", { autoFocus: true, className: "h-5 w-full bg-transparent text-xs text-foreground placeholder:text-(--ui-text-tertiary) focus:outline-none", onChange: event => setSearch(event.target.value), placeholder: copy.search, type: "text", value: search }) }), _jsx("div", { className: "max-h-[55vh] overflow-y-auto pb-1", children: providers.length === 0 ? (_jsx("div", { className: "px-3 py-5 text-center text-xs text-muted-foreground", children: modelOptions.isPending ? _jsx(GlyphSpinner, { className: "mx-auto text-sm" }) : copy.noAuthenticatedProviders })) : (providers.map(provider => {
                        const models = collapseModelFamilies(provider.models ?? []).filter(family => matches(provider, family.id));
                        if (models.length === 0) {
                            return null;
                        }
                        return (_jsxs("div", { className: "py-0.5", children: [_jsx("div", { className: "px-3 pb-0.5 pt-1 text-[0.625rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)", children: provider.name }), models.map(family => {
                                    const { name, tag } = modelDisplayParts(family.id);
                                    const key = modelVisibilityKey(provider.slug, family.id);
                                    return (_jsxs("label", { className: "flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-accent/50", children: [_jsxs("span", { className: "min-w-0 flex-1 truncate", children: [name, tag ? _jsxs("span", { className: "text-(--ui-text-tertiary)", children: [" ", tag] }) : null] }), _jsx(Switch, { checked: visible.has(key), onCheckedChange: () => toggle(provider, family.id) })] }, key));
                                })] }, provider.slug));
                    })) }), _jsx("div", { className: "px-3 py-2", children: _jsx(Button, { className: "-ml-2 text-(--ui-text-tertiary)", onClick: () => {
                            onOpenChange(false);
                            onOpenProviders();
                        }, size: "xs", type: "button", variant: "text", children: copy.addProvider }) })] }) }));
}
