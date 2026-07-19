import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ActionStatus } from '@/components/ui/action-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { renameProfile } from '@/hermes';
import { useI18n } from '@/i18n';
import { AlertTriangle } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { isValidProfileName } from './create-profile-dialog';
// Self-contained rename (owns the renameProfile call) so every caller just
// reacts via onRenamed. Unchanged name is a no-op close.
export function RenameProfileDialog({ currentName, onClose, onRenamed, open }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [name, setName] = useState(currentName);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        setName(currentName);
        setError(null);
        setStatus('idle');
    }, [currentName, open]);
    const trimmed = name.trim();
    const unchanged = trimmed === currentName;
    const invalid = trimmed !== '' && !unchanged && !isValidProfileName(trimmed);
    const busy = status === 'saving' || status === 'done';
    async function handleSubmit(event) {
        event.preventDefault();
        if (unchanged) {
            onClose();
            return;
        }
        if (!trimmed || invalid) {
            setError(invalid ? p.invalidName(p.nameHint) : p.nameRequired);
            return;
        }
        setStatus('saving');
        setError(null);
        try {
            await renameProfile(currentName, trimmed);
            await onRenamed?.(trimmed);
            setStatus('done');
            window.setTimeout(onClose, 800);
        }
        catch (err) {
            setStatus('idle');
            setError(err instanceof Error ? err.message : p.failedRename);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !busy && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: p.renameTitle }), _jsxs(DialogDescription, { children: [p.renameDescPrefix, _jsx("span", { className: "font-mono", children: "~/.local/bin" }), p.renameDescSuffix] })] }), _jsxs("form", { className: "grid gap-3", onSubmit: handleSubmit, children: [_jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "rename-profile-name", children: p.newNameLabel }), _jsx(Input, { "aria-invalid": invalid, autoFocus: true, id: "rename-profile-name", onChange: event => setName(event.target.value), value: name }), _jsx("p", { className: cn('text-[0.66rem] leading-4', invalid ? 'text-destructive' : 'text-muted-foreground'), children: p.nameHint })] }), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: busy, onClick: onClose, type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: busy || invalid || unchanged, type: "submit", children: _jsx(ActionStatus, { busy: p.renaming, done: p.renamed, idle: p.rename, state: status }) })] })] })] }) }));
}
