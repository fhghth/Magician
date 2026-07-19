import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ActionStatus } from '@/components/ui/action-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createProfile, updateProfileSoul } from '@/hermes';
import { useI18n } from '@/i18n';
import { AlertTriangle } from '@/lib/icons';
import { cn } from '@/lib/utils';
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function isValidProfileName(name) {
    return PROFILE_NAME_RE.test(name.trim());
}
// Self-contained create flow (name + clone toggle + optional SOUL.md). Owns the
// createProfile/updateProfileSoul calls so every caller just refreshes/selects
// via onCreated. SOUL left blank keeps the cloned/blank persona untouched.
export function CreateProfileDialog({ onClose, onCreated, open, profiles = [] }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [name, setName] = useState('');
    const [cloneFrom, setCloneFrom] = useState('default');
    const [soul, setSoul] = useState('');
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        setName('');
        setCloneFrom('default');
        setSoul('');
        setError(null);
        setStatus('idle');
    }, [open]);
    const trimmed = name.trim();
    const invalid = trimmed !== '' && !isValidProfileName(trimmed);
    const busy = status === 'saving' || status === 'done';
    async function handleSubmit(event) {
        event.preventDefault();
        if (!trimmed || invalid) {
            setError(invalid ? p.invalidName(p.nameHint) : p.nameRequired);
            return;
        }
        setStatus('saving');
        setError(null);
        try {
            await createProfile({ name: trimmed, clone_from: cloneFrom });
            if (soul.trim()) {
                await updateProfileSoul(trimmed, soul);
            }
            await onCreated?.(trimmed);
            setStatus('done');
            window.setTimeout(onClose, 800);
        }
        catch (err) {
            setStatus('idle');
            setError(err instanceof Error ? err.message : p.failedCreate);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !busy && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: p.newProfile }), _jsx(DialogDescription, { children: p.createDesc })] }), _jsxs("form", { className: "grid gap-4", onSubmit: handleSubmit, children: [_jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "new-profile-name", children: p.nameLabel }), _jsx(Input, { "aria-invalid": invalid, autoFocus: true, id: "new-profile-name", onChange: event => setName(event.target.value), placeholder: "my-profile", value: name }), _jsx("p", { className: cn('text-[0.66rem] leading-4', invalid ? 'text-destructive' : 'text-muted-foreground'), children: p.nameHint })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "new-profile-clone-from", children: p.cloneFrom }), _jsxs(Select, { onValueChange: value => setCloneFrom(value === '__none__' ? null : value), value: cloneFrom ?? '__none__', children: [_jsx(SelectTrigger, { className: "h-9 rounded-md", id: "new-profile-clone-from", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", children: p.cloneFromNone }), profiles.map(profile => (_jsx(SelectItem, { value: profile.name, children: profile.name }, profile.name)))] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: p.cloneFromDesc })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsxs("label", { className: "text-xs font-medium", htmlFor: "new-profile-soul", children: ["SOUL.md ", _jsxs("span", { className: "font-normal text-muted-foreground", children: ["- ", p.soulOptional] })] }), _jsx(Textarea, { className: "min-h-28 font-mono text-xs leading-5", id: "new-profile-soul", onChange: event => setSoul(event.target.value), placeholder: p.soulPlaceholder(cloneFrom ? p.soulPlaceholderCloned : p.soulPlaceholderEmpty), value: soul })] }), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: busy, onClick: onClose, type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: busy || !trimmed || invalid, type: "submit", children: _jsx(ActionStatus, { busy: p.creating, done: p.created, idle: p.createAction, state: status }) })] })] })] }) }));
}
