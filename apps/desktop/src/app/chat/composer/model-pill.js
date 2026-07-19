import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { ModelMenuCloseContext } from '@/app/shell/model-menu-panel';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { ChevronDown } from '@/lib/icons';
import { formatModelStatusLabel } from '@/lib/model-status-label';
import { cn } from '@/lib/utils';
import { $currentFastMode, $currentModel, $currentProvider, $currentReasoningEffort, setModelPickerOpen } from '@/store/session';
const PILL = cn('h-(--composer-control-size) max-w-40 shrink-0 gap-1 rounded-md px-2 text-xs font-normal', 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground');
/**
 * Composer model selector — the relocated status-bar pill. Reuses the live
 * `model.options` dropdown (`modelMenuContent`) verbatim; falls back to the
 * full picker when the gateway is closed and no live menu exists.
 */
export function ModelPill({ compact = false, disabled, model }) {
    const copy = useI18n().t.shell.statusbar;
    const currentModel = useStore($currentModel);
    const currentProvider = useStore($currentProvider);
    const fastMode = useStore($currentFastMode);
    const reasoningEffort = useStore($currentReasoningEffort);
    const [open, setOpen] = useState(false);
    // The model resolves a beat after the gateway/session comes up. Rather than
    // flash a literal "No model", show a quiet loader (inherits the pill text
    // color at half opacity) until a model lands.
    const label = compact ? (_jsx(ChevronDown, { className: "size-3.5 shrink-0 opacity-70" })) : (_jsxs(_Fragment, { children: [currentModel.trim() ? (_jsx("span", { className: "truncate", children: formatModelStatusLabel(currentModel, { fastMode, reasoningEffort }) })) : (_jsx(GlyphSpinner, { className: "opacity-50", spinner: "braille" })), _jsx(ChevronDown, { className: "size-2.5 shrink-0 opacity-50" })] }));
    // Compact (floating composer): a snug square holding just the chevron — no pill
    // padding, sized to match the other composer icon buttons.
    const pillClass = compact
        ? cn('size-(--composer-control-size) shrink-0 justify-center gap-0 rounded-md p-0', 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground')
        : PILL;
    const title = currentProvider ? copy.modelTitle(currentProvider, currentModel || copy.modelNone) : copy.switchModel;
    if (!model.modelMenuContent) {
        return (_jsx(Tip, { label: copy.openModelPicker, side: "top", children: _jsx(Button, { "aria-label": copy.openModelPicker, className: pillClass, disabled: disabled, onClick: () => setModelPickerOpen(true), type: "button", variant: "ghost", children: label }) }));
    }
    return (_jsxs(DropdownMenu, { onOpenChange: setOpen, open: open, children: [_jsx(Tip, { label: title, side: "top", children: _jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": title, className: pillClass, disabled: disabled, type: "button", variant: "ghost", children: label }) }) }), _jsx(DropdownMenuContent, { align: "end", className: "w-64 p-0", side: "top", sideOffset: 8, children: _jsx(ModelMenuCloseContext.Provider, { value: () => setOpen(false), children: model.modelMenuContent }) })] }));
}
