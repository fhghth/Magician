import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMemoryProviderConfig, saveMemoryProviderConfig } from '@/hermes';
import { Check, Loader2, Save } from '@/lib/icons';
import { notify, notifyError } from '@/store/notifications';
import { CONTROL_TEXT } from './constants';
import { LoadingState, Pill } from './primitives';
/** Seed editable values from the schema: non-secret fields keep their current
 *  value, secret fields start blank (their value is never returned). */
function seedValues(config) {
    return Object.fromEntries(config.fields.map(field => [field.key, field.kind === 'secret' ? '' : field.value]));
}
function FieldControl({ field, value, onChange }) {
    if (field.kind === 'select') {
        const selected = field.options.find(option => option.value === value);
        return (_jsxs(_Fragment, { children: [_jsxs(Select, { onValueChange: onChange, value: value, children: [_jsx(SelectTrigger, { className: CONTROL_TEXT, children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: field.options.map(option => (_jsx(SelectItem, { value: option.value, children: option.label }, option.value))) })] }), (selected?.description || field.description) && (_jsx("span", { className: "text-xs text-muted-foreground", children: selected?.description || field.description }))] }));
    }
    if (field.kind === 'secret') {
        return (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Input, { className: "min-w-64 flex-1 font-mono", onChange: event => onChange(event.target.value), placeholder: field.is_set ? 'Leave blank to keep current value' : field.placeholder, type: "password", value: value }), field.is_set && (_jsxs(Pill, { tone: "primary", children: [_jsx(Check, { className: "size-3" }), "Set"] }))] }));
    }
    return (_jsx(Input, { className: "font-mono", onChange: event => onChange(event.target.value), placeholder: field.placeholder, value: value }));
}
export function ProviderConfigPanel({ provider }) {
    const [config, setConfig] = useState(null);
    const [values, setValues] = useState({});
    const [expanded, setExpanded] = useState(true);
    const [saving, setSaving] = useState(false);
    const refresh = useCallback(async () => {
        try {
            const next = await getMemoryProviderConfig(provider);
            setConfig(next);
            setValues(seedValues(next));
        }
        catch (err) {
            notifyError(err, 'Memory provider settings failed to load');
            setConfig(null);
        }
    }, [provider]);
    useEffect(() => {
        setConfig(null);
        void refresh();
    }, [refresh]);
    const save = useCallback(async () => {
        if (!config) {
            return;
        }
        setSaving(true);
        try {
            await saveMemoryProviderConfig(provider, values);
            notify({ kind: 'success', title: `${config.label} saved`, message: 'Memory provider configuration updated.' });
            await refresh();
        }
        catch (err) {
            notifyError(err, `Failed to save ${config.label} settings`);
        }
        finally {
            setSaving(false);
        }
    }, [config, provider, refresh, values]);
    // Providers without a declared config surface (e.g. builtin) render nothing.
    if (config && config.fields.length === 0) {
        return null;
    }
    if (!config) {
        return _jsx(LoadingState, { label: "Loading memory provider settings..." });
    }
    const secretFields = config.fields.filter(field => field.kind === 'secret');
    return (_jsxs("section", { className: "py-3", children: [_jsx("button", { "aria-expanded": expanded, className: "flex w-full items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-left hover:bg-accent/50", onClick: () => setExpanded(open => !open), type: "button", children: _jsxs("span", { className: "flex min-w-0 items-center gap-2", children: [_jsx(DisclosureCaret, { open: expanded }), _jsxs("span", { className: "text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: [config.label, " settings"] }), secretFields.map(field => (_jsx(Pill, { children: field.is_set ? `${field.label} set` : `${field.label} not set` }, field.key)))] }) }), expanded && (_jsxs("div", { className: "mt-3 grid gap-4 rounded-xl bg-background/60 p-4", children: [config.fields.map(field => (_jsxs("label", { className: "grid gap-1.5", children: [_jsx("span", { className: "text-xs font-medium text-muted-foreground", children: field.label }), _jsx(FieldControl, { field: field, onChange: value => setValues(current => ({ ...current, [field.key]: value })), value: values[field.key] ?? '' }), field.kind !== 'select' && field.description && (_jsx("span", { className: "text-xs text-muted-foreground", children: field.description }))] }, field.key))), _jsx("div", { className: "flex justify-end", children: _jsxs(Button, { disabled: saving, onClick: () => void save(), size: "sm", children: [saving ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(Save, {}), "Save"] }) })] }))] }));
}
