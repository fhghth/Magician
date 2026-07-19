import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { Upload } from '@/lib/icons';
// Share / import a map as a single code. The textarea shows the current map's
// code (copy it to share); edit/replace it and hit Load to view someone else's.
// One field, one button — a standard Dialog matching rename/create.
export function ShareControls({ imported = false, onImport, onResetMap, shareCode }) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState(null);
    const own = (shareCode ?? '').trim();
    const code = value.trim();
    const canLoad = code !== '' && code !== own;
    const load = () => {
        if (!code) {
            setError(t.starmap.importEmpty);
            return;
        }
        const err = onImport?.(code) ?? null;
        setError(err);
        if (err === null) {
            setOpen(false);
        }
    };
    return (_jsxs("div", { className: "flex items-center gap-1", children: [imported && (_jsx(Button, { className: "text-muted-foreground hover:text-foreground", onClick: () => onResetMap?.(), size: "xs", variant: "text", children: t.starmap.resetToMine })), _jsxs(Dialog, { onOpenChange: next => {
                    setOpen(next);
                    setError(null);
                    if (next) {
                        setValue(shareCode ?? '');
                    }
                }, open: open, children: [_jsx(DialogTrigger, { asChild: true, children: _jsx(Button, { "aria-label": t.starmap.shareTitle, className: "text-muted-foreground hover:text-foreground", size: "icon", title: t.starmap.shareTitle, variant: "ghost", children: _jsx(Upload, { className: "size-3.5" }) }) }), _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: t.starmap.shareTitle }), _jsx(DialogDescription, { children: t.starmap.shareHint })] }), _jsxs("div", { className: "group/code relative", children: [_jsx("textarea", { "aria-label": t.starmap.shareTitle, className: "h-24 w-full resize-none rounded-md bg-foreground/5 p-2.5 pr-9 font-mono text-xs leading-relaxed break-all text-muted-foreground/90 outline-none transition placeholder:text-muted-foreground/50 focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/40", onChange: e => {
                                            setValue(e.target.value);
                                            setError(null);
                                        }, placeholder: t.starmap.sharePlaceholder, spellCheck: false, value: value }), code !== '' && (_jsx(CopyButton, { appearance: "inline", className: "absolute right-1.5 top-1.5 h-5 gap-0 rounded-md px-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/code:opacity-100 hover:opacity-100", iconClassName: "size-3", label: t.starmap.copy, showLabel: false, text: value }))] }), error && _jsx("p", { className: "text-[0.7rem] text-destructive", children: error }), _jsx(Button, { className: "w-full", disabled: !canLoad, onClick: load, type: "button", children: t.starmap.importBtn })] })] })] }));
}
