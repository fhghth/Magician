import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { Globe } from '@/lib/icons';
const URL_HINT = /^https?:\/\//i;
export function UrlDialog({ inputRef, onChange, onOpenChange, onSubmit, open, value }) {
    const { t } = useI18n();
    const c = t.composer;
    const trimmed = value.trim();
    const looksLikeUrl = trimmed.length > 0 && URL_HINT.test(trimmed);
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogContent, { className: "max-w-md gap-5", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { icon: Globe, children: c.attachUrlTitle }), _jsx(DialogDescription, { children: c.attachUrlDesc })] }), _jsxs("form", { className: "grid gap-4", onSubmit: e => {
                        e.preventDefault();
                        onSubmit();
                    }, children: [_jsxs("div", { className: "grid gap-1.5", children: [_jsx(Input, { autoComplete: "off", autoCorrect: "off", inputMode: "url", onChange: e => onChange(e.target.value), placeholder: c.urlPlaceholder, ref: inputRef, spellCheck: false, value: value }), trimmed.length > 0 && !looksLikeUrl && (_jsxs("p", { className: "text-xs text-muted-foreground/85", children: [c.urlHintPre, _jsx("span", { className: "font-mono", children: "https://\u2026" })] }))] }), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: () => onOpenChange(false), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: !looksLikeUrl, type: "submit", children: c.attach })] })] })] }) }));
}
