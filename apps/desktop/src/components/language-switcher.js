import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { LOCALE_META, useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Check, ChevronDown, Globe } from '@/lib/icons';
import { normalize } from '@/lib/text';
import { cn } from '@/lib/utils';
import { notifyError } from '@/store/notifications';
export function LanguageSwitcher({ className, collapsed = false, dropUp = false }) {
    const { isSavingLocale, locale, setLocale, t } = useI18n();
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();
    const useMobileSheet = Boolean(dropUp && isMobile);
    const current = LOCALE_META[locale];
    const allLocales = Object.entries(LOCALE_META);
    const title = t.language.switchTo;
    const selectLocale = async (code) => {
        if (code === locale || isSavingLocale) {
            setOpen(false);
            return;
        }
        triggerHaptic('selection');
        try {
            await setLocale(code);
            setOpen(false);
            triggerHaptic('success');
        }
        catch (error) {
            notifyError(error, t.language.saveError);
        }
    };
    const trigger = (_jsxs(Button, { "aria-expanded": open, "aria-label": title, className: cn('min-w-32 justify-between gap-2 border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2.5 text-left text-muted-foreground hover:text-foreground', collapsed && 'min-w-0 px-2', className), disabled: isSavingLocale, size: "sm", title: title, type: "button", variant: "outline", children: [_jsxs("span", { className: "inline-flex min-w-0 items-center gap-2", children: [_jsx(Globe, { className: "size-3.5 shrink-0" }), !collapsed && _jsx("span", { className: "truncate", children: current.name })] }), !collapsed && _jsx(ChevronDown, { className: "size-3 shrink-0 opacity-70" })] }));
    if (useMobileSheet) {
        return (_jsxs(Sheet, { onOpenChange: setOpen, open: open, children: [_jsx(SheetTrigger, { asChild: true, children: trigger }), _jsxs(SheetContent, { className: "max-h-[min(28rem,80vh)] rounded-t-xl", side: "bottom", children: [_jsxs(SheetHeader, { children: [_jsx(SheetTitle, { children: title }), _jsx(SheetDescription, { children: t.language.description })] }), _jsx(LanguageCommand, { allLocales: allLocales, disabled: isSavingLocale, locale: locale, noResults: t.language.noResults, onSelect: code => void selectLocale(code), searchPlaceholder: t.language.searchPlaceholder })] })] }));
    }
    return (_jsxs(Popover, { onOpenChange: setOpen, open: open, children: [_jsx(PopoverTrigger, { asChild: true, children: trigger }), _jsx(PopoverContent, { align: "end", className: "w-56 p-0", side: dropUp ? 'top' : 'bottom', children: _jsx(LanguageCommand, { allLocales: allLocales, autoFocus: true, disabled: isSavingLocale, locale: locale, noResults: t.language.noResults, onSelect: code => void selectLocale(code), searchPlaceholder: t.language.searchPlaceholder }) })] }));
}
function LanguageCommand({ allLocales, autoFocus, disabled, locale, noResults, onSelect, searchPlaceholder }) {
    const [search, setSearch] = useState('');
    // Own the search term and filter manually. cmdk's built-in shouldFilter
    // reorders items by its fuzzy-match score (≈alphabetical with an empty
    // query), which destroys the curated en→zh→zh-hant→ja order. We disable it
    // and do a plain substring filter that preserves array order — matching
    // model-picker.tsx. Match against the endonym, the (hidden) English name,
    // and the locale code so "日本"/"japanese"/"ja" all find Japanese.
    const q = normalize(search);
    const filtered = allLocales.filter(([code, meta]) => !q ||
        meta.name.toLowerCase().includes(q) ||
        meta.englishName.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q));
    return (_jsxs(Command, { className: "bg-transparent", shouldFilter: false, children: [_jsx(CommandInput, { autoFocus: autoFocus, onValueChange: setSearch, placeholder: searchPlaceholder, value: search }), _jsx(CommandList, { className: "max-h-80 p-1", children: filtered.length === 0 ? (_jsx("div", { className: "py-6 text-center text-sm text-muted-foreground", children: noResults })) : (filtered.map(([code, meta]) => {
                    const selected = code === locale;
                    return (_jsxs(CommandItem, { className: cn(selected ? 'font-medium text-foreground' : 'text-muted-foreground'), disabled: disabled, onSelect: () => onSelect(code), value: code, children: [_jsx(Check, { className: cn('size-3.5 shrink-0 text-primary', !selected && 'invisible') }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: meta.name }), _jsx("span", { className: "font-mono text-[0.65rem] uppercase text-(--ui-text-tertiary)", children: code })] }, code));
                })) })] }));
}
