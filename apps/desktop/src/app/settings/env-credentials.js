import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { deleteEnvVar, getEnvVars, revealEnvVar, setEnvVar } from '@/hermes';
import { useI18n } from '@/i18n';
import { notify, notifyError } from '@/store/notifications';
import { asText, includesQuery, redactedValue, withoutKey } from './helpers';
import { Pill } from './primitives';
// Shared filter used by every credential surface (Providers + Keys pages):
// category gate first, then a free-text match across key name + description.
export function filterEnv(info, key, q, cat, extra) {
    if (asText(info.category) !== cat) {
        return false;
    }
    if (!q) {
        return true;
    }
    return (key.toLowerCase().includes(q) ||
        includesQuery(info.description, q) ||
        Boolean(extra && extra.toLowerCase().includes(q)));
}
export function SettingsCategoryHeading({ count, icon: Icon, title }) {
    return (_jsxs("div", { className: "mb-3 flex items-center gap-2 text-[length:var(--conversation-text-font-size)] font-medium", children: [_jsx(Icon, { className: "size-4 text-muted-foreground" }), _jsx("span", { children: title }), count && _jsx(Pill, { children: count })] }));
}
// Owns the env-var fetch + the edit/reveal/save/delete lifecycle so multiple
// credential pages (Providers, Keys) share one source of truth and one set of
// mutation handlers instead of duplicating the plumbing.
export function useEnvCredentials() {
    const { t } = useI18n();
    const credentials = t.settings.credentials;
    const toolsets = t.settings.toolsets;
    const [vars, setVars] = useState(null);
    const [edits, setEdits] = useState({});
    const [revealed, setRevealed] = useState({});
    const [saving, setSaving] = useState(null);
    // Best-effort cleanup of a retired localStorage flag (global "Show
    // advanced" toggle) — everything in these views is configuration-level.
    useEffect(() => {
        try {
            window.localStorage.removeItem('desktop.settings.keys.show_advanced');
        }
        catch {
            // Ignore — old key cleanup is best-effort.
        }
    }, []);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const next = await getEnvVars();
                if (!cancelled) {
                    setVars(next);
                }
            }
            catch (err) {
                notifyError(err, t.settings.keys.failedLoad);
            }
        })();
        return () => void (cancelled = true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; copy is stable
    }, []);
    function patchVar(key, patch) {
        setVars(c => (c ? { ...c, [key]: { ...c[key], ...patch } } : c));
    }
    function clearLocalState(key) {
        setEdits(c => withoutKey(c, key));
        setRevealed(c => withoutKey(c, key));
    }
    async function handleSave(key) {
        const value = edits[key];
        if (!value) {
            return;
        }
        setSaving(key);
        try {
            await setEnvVar(key, value);
            patchVar(key, { is_set: true, redacted_value: redactedValue(value) });
            clearLocalState(key);
            notify({ kind: 'success', title: toolsets.savedTitle, message: toolsets.savedMessage(key) });
        }
        catch (err) {
            notifyError(err, toolsets.failedSave(key));
        }
        finally {
            setSaving(null);
        }
    }
    // Direct save for a known value (no edit-state round-trip) — used by the
    // onboarding-style key form, which owns its own input. Returns a result so
    // the form can surface inline errors instead of only toasting.
    async function saveValue(key, value) {
        const trimmed = value.trim();
        if (!trimmed) {
            return { message: credentials.enterValueFirst, ok: false };
        }
        setSaving(key);
        try {
            await setEnvVar(key, trimmed);
            patchVar(key, { is_set: true, redacted_value: redactedValue(trimmed) });
            clearLocalState(key);
            notify({ kind: 'success', message: toolsets.savedMessage(key), title: toolsets.savedTitle });
            return { ok: true };
        }
        catch (err) {
            notifyError(err, toolsets.failedSave(key));
            return { message: err instanceof Error ? err.message : credentials.couldNotSave, ok: false };
        }
        finally {
            setSaving(null);
        }
    }
    async function handleClear(key) {
        if (!window.confirm(toolsets.removeConfirm(key))) {
            return;
        }
        setSaving(key);
        try {
            await deleteEnvVar(key);
            patchVar(key, { is_set: false, redacted_value: null });
            clearLocalState(key);
            notify({ kind: 'success', title: toolsets.removedTitle, message: toolsets.removedMessage(key) });
        }
        catch (err) {
            notifyError(err, toolsets.failedRemove(key));
        }
        finally {
            setSaving(null);
        }
    }
    async function handleReveal(key) {
        if (revealed[key]) {
            setRevealed(c => withoutKey(c, key));
            return;
        }
        try {
            const result = await revealEnvVar(key);
            setRevealed(c => ({ ...c, [key]: result.value }));
        }
        catch (err) {
            notifyError(err, toolsets.failedReveal(key));
        }
    }
    return {
        saveValue,
        vars,
        rowProps: {
            edits,
            revealed,
            saving,
            setEdits,
            onSave: handleSave,
            onClear: handleClear,
            onReveal: handleReveal
        }
    };
}
