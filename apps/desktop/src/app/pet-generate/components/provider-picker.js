import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Check, ChevronDown } from '@/lib/icons';
import { $petGenProvider, $petGenProviders, setPetGenProvider } from '@/store/pet-generate';
// Image-backend picker for pet generation — the composer's model-pill pattern:
// a quiet trigger + a dropdown of options. No per-option notes: every backend
// resolves to the same faithful OpenAI image model, so there's no tradeoff to
// describe. Hidden unless there are 2+ reference-capable backends (nothing to pick).
export function ProviderPicker() {
    const providers = useStore($petGenProviders);
    const picked = useStore($petGenProvider);
    if (providers.length < 2) {
        return null;
    }
    const fallback = providers.find(p => p.default) ?? providers[0];
    const current = providers.find(p => p.name === picked) ?? fallback;
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsxs("button", { className: "flex h-6 items-center gap-1 text-[0.6875rem] text-(--ui-text-tertiary) transition hover:text-foreground", type: "button", children: [current?.label, _jsx(ChevronDown, { className: "size-3" })] }) }), _jsx(DropdownMenuContent, { align: "start", className: "z-[140]", children: providers.map(provider => (_jsxs(DropdownMenuItem, { className: "flex items-center gap-1.5", 
                    // Picking the default clears the override (no need to pin it).
                    onSelect: () => setPetGenProvider(provider.default ? '' : provider.name), children: [_jsx("span", { className: "min-w-0 flex-1 truncate font-medium text-foreground", children: provider.label }), provider.name === current?.name && _jsx(Check, { className: "size-3.5 text-primary" })] }, provider.name))) })] }));
}
