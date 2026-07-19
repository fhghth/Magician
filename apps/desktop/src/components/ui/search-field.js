import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { useI18n } from '@/i18n';
import { Loader2, Search } from '@/lib/icons';
import { cn } from '@/lib/utils';
/**
 * Shared search field used everywhere (sessions sidebar, pages, overlays,
 * command center, cron). No box — borderless until focus, then an underline.
 * Rests at low opacity until focused or filled. Width/placement come from
 * `containerClassName`.
 */
export function SearchField({ placeholder, value, onChange, hints, containerClassName, inputClassName, loading = false, onClear, inputRef, trailingAction, 'aria-label': ariaLabel }) {
    const { t } = useI18n();
    const clear = onClear ?? (() => onChange(''));
    // One hint per mount, picked at random — fresh nudge every visit, no
    // mid-page carousel.
    const [hintIndex] = useState(() => Math.floor(Math.random() * 4096));
    const hintCount = hints?.length ?? 0;
    const effectivePlaceholder = hintCount > 0 ? hints[hintIndex % hintCount] : placeholder;
    return (_jsxs("div", { className: cn(
        // min-w-0 is load-bearing: without it the content-sized input sets the
        // container's flex min-width and the field bulldozes its siblings
        // instead of shrinking to fit its context.
        'inline-flex min-w-0 max-w-full items-center gap-1.5 border-b border-transparent px-0.5 transition-[color,border-color,opacity]', 
        // Recede until the user reaches for it.
        !value && 'opacity-30 focus-within:opacity-100', containerClassName), children: [_jsx(Search, { className: "pointer-events-none size-3.5 shrink-0 text-muted-foreground/70" }), _jsx("input", { "aria-label": ariaLabel ?? placeholder, className: cn(
                // `field-sizing: content` grows the input to fit the placeholder/typed
                // text; min-w-0 lets it shrink back below content size when the
                // context is narrower — long queries scroll inside the field.
                // text-xs matches the form controls (Input/Select via controlVariants).
                'h-7 min-w-0 max-w-full bg-transparent text-xs text-foreground [field-sizing:content] placeholder:text-muted-foreground focus:outline-none', inputClassName), onChange: event => onChange(event.target.value), placeholder: effectivePlaceholder, ref: inputRef, type: "text", value: value }), trailingAction, loading ? (_jsx(Loader2, { className: "pointer-events-none size-3.5 shrink-0 animate-spin text-muted-foreground/70" })) : value ? (_jsx(Button, { "aria-label": t.ui.search.clear, className: "shrink-0 text-muted-foreground/85 hover:bg-accent/60 hover:text-foreground", onClick: clear, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.875rem" }) })) : null] }));
}
