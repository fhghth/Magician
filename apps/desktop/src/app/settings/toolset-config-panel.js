import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteEnvVar, getActionStatus, getToolsetConfig, getToolsetModels, revealEnvVar, runToolsetPostSetup, selectToolsetModel, selectToolsetProvider, setEnvVar } from '@/hermes';
import { useI18n } from '@/i18n';
import { Check, Loader2, Save, Terminal } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { upsertDesktopActionTask } from '@/store/activity';
import { notify, notifyError } from '@/store/notifications';
import { EnvVarActionsMenu, EnvVarActionsTrigger } from './env-var-actions-menu';
import { Pill } from './primitives';
/** Toolsets whose backends expose a selectable model catalog (mirrors the
 *  backend's _MODEL_CATALOG_TOOLSETS map). */
const MODEL_CATALOG_TOOLSETS = new Set(['image_gen', 'video_gen']);
function providerConfigured(provider, envState) {
    if (provider.env_vars.length === 0) {
        return true;
    }
    return provider.env_vars.every(ev => envState[ev.key]);
}
function EnvVarField({ envVar, isSet, onSaved, onCleared }) {
    const { t } = useI18n();
    const copy = t.settings.toolsets;
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [revealed, setRevealed] = useState(null);
    const [busy, setBusy] = useState(false);
    async function handleSave() {
        if (!value) {
            return;
        }
        setBusy(true);
        try {
            await setEnvVar(envVar.key, value);
            setEditing(false);
            setValue('');
            onSaved(envVar.key);
            notify({ kind: 'success', title: copy.savedTitle, message: copy.savedMessage(envVar.key) });
        }
        catch (err) {
            notifyError(err, copy.failedSave(envVar.key));
        }
        finally {
            setBusy(false);
        }
    }
    async function handleClear() {
        if (!window.confirm(copy.removeConfirm(envVar.key))) {
            return;
        }
        setBusy(true);
        try {
            await deleteEnvVar(envVar.key);
            setRevealed(null);
            onCleared(envVar.key);
            notify({ kind: 'success', title: copy.removedTitle, message: copy.removedMessage(envVar.key) });
        }
        catch (err) {
            notifyError(err, copy.failedRemove(envVar.key));
        }
        finally {
            setBusy(false);
        }
    }
    async function handleReveal() {
        if (revealed !== null) {
            setRevealed(null);
            return;
        }
        try {
            const result = await revealEnvVar(envVar.key);
            setRevealed(result.value);
        }
        catch (err) {
            notifyError(err, copy.failedReveal(envVar.key));
        }
    }
    return (_jsxs("div", { className: "grid gap-2 rounded-lg bg-background/55 p-2.5", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "font-mono text-xs font-medium", children: envVar.key }), _jsxs(Pill, { tone: isSet ? 'primary' : 'muted', children: [isSet && _jsx(Check, { className: "size-3" }), isSet ? copy.set : copy.notSet] })] }), envVar.prompt && envVar.prompt !== envVar.key && (_jsx("p", { className: "mt-0.5 text-[0.7rem] text-muted-foreground", children: envVar.prompt }))] }), !editing && (_jsx(EnvVarActionsMenu, { clearDisabled: busy, docsUrl: envVar.url, isRevealed: revealed !== null, isSet: isSet, label: envVar.key, onClear: () => void handleClear(), onEdit: () => setEditing(true), onReveal: () => void handleReveal(), children: _jsx(EnvVarActionsTrigger, { label: envVar.key, onClick: event => event.stopPropagation() }) }))] }), isSet && revealed !== null && (_jsx("div", { className: "rounded-md bg-background px-2.5 py-1.5 font-mono text-xs text-foreground", children: revealed || '---' })), editing && (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(Input, { autoFocus: true, className: "min-w-52 flex-1 font-mono", onChange: e => setValue(e.target.value), placeholder: envVar.prompt || envVar.key, type: envVar.default ? 'text' : 'password', value: value }), _jsxs(Button, { disabled: busy || !value, onClick: () => void handleSave(), size: "sm", children: [busy ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(Save, {}), t.common.save] }), _jsx(Button, { onClick: () => setEditing(false), size: "sm", variant: "text", children: t.common.cancel })] }))] }));
}
/**
 * Runs a provider's post-setup install hook (npm / pip / binary) via the
 * `/api/tools/toolsets/{name}/post-setup` spawn-action and tails the resulting
 * log inline — the GUI equivalent of the install step `hermes tools` runs
 * after you pick a backend that needs extra dependencies.
 */
function PostSetupRunner({ toolset, postSetupKey, onComplete }) {
    const { t } = useI18n();
    const copy = t.settings.toolsets;
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState(null);
    // Guard against overlapping polls / state updates after unmount.
    const activeRef = useRef(false);
    useEffect(() => {
        return () => {
            activeRef.current = false;
        };
    }, []);
    const run = useCallback(async () => {
        setRunning(true);
        setStatus(null);
        activeRef.current = true;
        try {
            const started = await runToolsetPostSetup(toolset, postSetupKey);
            // The spawn endpoint reports ok:false if it couldn't launch the action
            // (e.g. unknown key, server-side spawn failure). Don't poll a status
            // that will never exist — surface the failure and stop.
            if (!started.ok) {
                notifyError(new Error('spawn failed'), copy.postSetupFailed(postSetupKey));
                return;
            }
            let last = null;
            // Mirror command-center's runSystemAction poll loop: poll the action log
            // until it exits (or we hit the attempt ceiling), feeding the global
            // activity rail as we go.
            for (let attempt = 0; attempt < 150 && activeRef.current; attempt += 1) {
                await new Promise(resolve => window.setTimeout(resolve, 1200));
                if (!activeRef.current) {
                    break;
                }
                const polled = await getActionStatus(started.name, 300);
                last = polled;
                setStatus(polled);
                upsertDesktopActionTask(polled);
                if (!polled.running) {
                    break;
                }
            }
            if (activeRef.current) {
                const ok = last?.exit_code === 0;
                notify(ok
                    ? {
                        kind: 'success',
                        title: copy.postSetupCompleteTitle,
                        message: copy.postSetupCompleteMessage(postSetupKey)
                    }
                    : { kind: 'error', title: copy.postSetupErrorTitle, message: copy.postSetupErrorMessage(postSetupKey) });
                onComplete?.();
            }
        }
        catch (err) {
            if (activeRef.current) {
                notifyError(err, copy.postSetupFailed(postSetupKey));
            }
        }
        finally {
            if (activeRef.current) {
                setRunning(false);
            }
        }
    }, [toolset, postSetupKey, onComplete, copy]);
    return (_jsxs("div", { className: "grid gap-2 rounded-lg bg-background/55 p-2.5", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsx("div", { className: "min-w-0", children: _jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: copy.postSetupHint(postSetupKey) }) }), _jsxs(Button, { disabled: running, onClick: () => void run(), size: "sm", children: [running ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(Terminal, { className: "size-3.5" }), running ? copy.postSetupRunning : copy.postSetupRun] })] }), status && (status.lines.length > 0 || status.running) && (_jsx("pre", { className: "max-h-48 overflow-y-auto rounded-md bg-background px-2.5 py-1.5 font-mono text-[0.7rem] leading-relaxed text-muted-foreground whitespace-pre-wrap", "data-selectable-text": "true", children: status.lines.length > 0 ? status.lines.join('\n') : copy.postSetupStarting }))] }));
}
/**
 * Backend model catalog — the GUI counterpart of the model picker `hermes
 * tools` runs after you choose an image/video generation backend (e.g. FAL's
 * multi-model catalog). Renders speed / strengths / price per model as a
 * radio-card list and persists the choice to `image_gen.model` /
 * `video_gen.model`.
 */
function ModelCatalogPicker({ toolset, providerName, isActiveBackend }) {
    const { t } = useI18n();
    const copy = t.settings.toolsets;
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getToolsetModels(toolset, providerName)
            .then(next => {
            if (!cancelled) {
                setCatalog(next);
            }
        })
            .catch(() => {
            // Backend predates the models endpoint or the provider has no
            // catalog — hide the section entirely rather than erroring.
            if (!cancelled) {
                setCatalog(null);
            }
        })
            .finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });
        return () => void (cancelled = true);
    }, [toolset, providerName]);
    const pick = async (modelId) => {
        setSaving(modelId);
        try {
            await selectToolsetModel(toolset, modelId, providerName);
            setCatalog(current => (current ? { ...current, current: modelId } : current));
            notify({ kind: 'success', title: copy.modelSelectedTitle, message: copy.modelSelectedMessage(modelId) });
        }
        catch (err) {
            notifyError(err, copy.failedSelectModel(modelId));
        }
        finally {
            setSaving(null);
        }
    };
    if (loading) {
        return (_jsxs("div", { className: "flex items-center gap-2 px-1 py-2 text-[0.72rem] text-muted-foreground", children: [_jsx(Loader2, { className: "size-3 animate-spin" }), copy.loadingModels] }));
    }
    if (!catalog || !catalog.has_models || catalog.models.length === 0) {
        return null;
    }
    const selected = catalog.current ?? catalog.default;
    return (_jsxs("div", { className: "grid gap-1.5", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-2 px-0.5", children: [_jsx("span", { className: "text-[0.72rem] font-medium", children: copy.modelSectionTitle }), _jsx("span", { className: "text-[0.68rem] text-muted-foreground", children: copy.modelCount(catalog.models.length) })] }), !isActiveBackend && _jsx("p", { className: "px-0.5 text-[0.68rem] text-muted-foreground", children: copy.modelInactiveHint }), _jsx("div", { className: "grid gap-1", children: catalog.models.map(model => {
                    const isSelected = selected === model.id;
                    const isDefault = catalog.default === model.id;
                    return (_jsxs("button", { "aria-pressed": isSelected, className: cn('grid gap-0.5 rounded-lg border px-2.5 py-2 text-left transition', isSelected
                            ? 'border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary)'
                            : 'border-transparent bg-background/55 hover:bg-accent/40', !isActiveBackend && 'opacity-60'), disabled: saving !== null || !isActiveBackend, onClick: () => void pick(model.id), type: "button", children: [_jsxs("span", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "font-mono text-xs font-medium", children: model.display || model.id }), isSelected && (_jsxs(Pill, { tone: "primary", children: [_jsx(Check, { className: "size-3" }), copy.modelInUse] })), !isSelected && isDefault && _jsx(Pill, { children: copy.modelDefault }), saving === model.id && _jsx(Loader2, { className: "size-3 animate-spin" })] }), _jsxs("span", { className: "flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.68rem] text-muted-foreground", children: [model.speed && _jsx("span", { children: model.speed }), model.strengths && _jsx("span", { children: model.strengths }), model.price && _jsx("span", { className: "font-mono", children: model.price })] })] }, model.id));
                }) })] }));
}
export function ToolsetConfigPanel({ toolset, onConfiguredChange }) {
    const { t } = useI18n();
    const copy = t.settings.toolsets;
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selecting, setSelecting] = useState(null);
    const [activeProvider, setActiveProvider] = useState(null);
    // Live per-key set/unset state, seeded from the endpoint then patched locally.
    const [envState, setEnvState] = useState({});
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const next = await getToolsetConfig(toolset);
            setCfg(next);
            const seeded = {};
            for (const provider of next.providers) {
                for (const ev of provider.env_vars) {
                    seeded[ev.key] = ev.is_set;
                }
            }
            setEnvState(seeded);
        }
        catch (err) {
            notifyError(err, copy.failedLoad);
        }
        finally {
            setLoading(false);
        }
    }, [copy.failedLoad, toolset]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const providers = useMemo(() => cfg?.providers ?? [], [cfg]);
    // Default the expanded provider to the one actually active in config
    // (`is_active` / `cfg.active_provider`, mirroring the CLI picker), then the
    // first fully-configured provider, else the first provider. Without this the
    // panel highlighted the first keyless provider (e.g. Nous Portal) even when
    // the user had already selected another (e.g. DuckDuckGo).
    useEffect(() => {
        if (activeProvider || providers.length === 0) {
            return;
        }
        const selected = providers.find(p => p.is_active) ??
            (cfg?.active_provider ? providers.find(p => p.name === cfg.active_provider) : undefined) ??
            providers.find(p => providerConfigured(p, envState)) ??
            providers[0];
        setActiveProvider(selected.name);
    }, [activeProvider, providers, envState, cfg]);
    async function handleSelect(provider) {
        setActiveProvider(provider.name);
        setSelecting(provider.name);
        try {
            await selectToolsetProvider(toolset, provider.name);
            // Mirror the backend write locally so dependent UI (model catalog
            // enablement) tracks the new active backend without a refetch.
            setCfg(current => current
                ? {
                    ...current,
                    active_provider: provider.name,
                    providers: current.providers.map(p => ({ ...p, is_active: p.name === provider.name }))
                }
                : current);
            notify({ kind: 'success', title: copy.selectedTitle, message: copy.selectedMessage(provider.name) });
            onConfiguredChange?.();
        }
        catch (err) {
            notifyError(err, copy.failedSelect(provider.name));
        }
        finally {
            setSelecting(null);
        }
    }
    function patchEnv(key, isSet) {
        setEnvState(c => ({ ...c, [key]: isSet }));
        onConfiguredChange?.();
    }
    if (loading) {
        // Inline row, not a full block loader — a big centered spinner is what
        // caused the Skills/Tools tab-switch layout jump; this reads as "more
        // config incoming" without reserving a tall empty area.
        return (_jsxs("div", { className: "flex items-center gap-2 px-1 text-xs text-muted-foreground", children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), copy.loadingConfig] }));
    }
    // Nothing to configure → render nothing. An inspector explaining that there
    // is nothing to explain is noise (the old expander UX needed the message so
    // an expanded-empty panel didn't look broken; the always-open detail doesn't).
    if (!cfg || !cfg.has_category) {
        return null;
    }
    if (providers.length === 0) {
        return _jsx("p", { className: "px-1 py-3 text-xs text-muted-foreground", children: copy.noProviders });
    }
    return (_jsx("div", { className: "grid gap-2", children: providers.map(provider => {
            const isActive = activeProvider === provider.name;
            const configured = providerConfigured(provider, envState);
            return (_jsxs("div", { className: "overflow-hidden rounded-xl bg-background/60", children: [_jsxs("button", { "aria-pressed": isActive, className: cn('flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-accent/50', isActive && 'bg-accent/40'), onClick: () => void handleSelect(provider), type: "button", children: [_jsxs("span", { className: "flex min-w-0 items-center gap-2", children: [_jsx("span", { className: "truncate text-sm font-medium", children: provider.name }), provider.badge && _jsx(Pill, { children: provider.badge }), configured && (_jsxs(Pill, { tone: "primary", children: [_jsx(Check, { className: "size-3" }), copy.ready] }))] }), selecting === provider.name && _jsx(Loader2, { className: "size-3.5 shrink-0 animate-spin" })] }), isActive && (_jsxs("div", { className: "grid gap-2 bg-muted/20 p-3", children: [provider.tag && _jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: provider.tag }), provider.requires_nous_auth && (_jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: copy.nousIncluded })), provider.env_vars.length === 0 ? (_jsx("p", { className: "text-[0.72rem] text-muted-foreground", children: copy.noApiKeyRequired })) : (provider.env_vars.map(ev => (_jsx(EnvVarField, { envVar: ev, isSet: Boolean(envState[ev.key]), onCleared: key => patchEnv(key, false), onSaved: key => patchEnv(key, true) }, ev.key)))), provider.post_setup && (_jsx(PostSetupRunner, { onComplete: () => void refresh(), postSetupKey: provider.post_setup, toolset: toolset })), MODEL_CATALOG_TOOLSETS.has(toolset) && (_jsx(ModelCatalogPicker, { isActiveBackend: provider.is_active || cfg?.active_provider === provider.name, providerName: provider.name, toolset: toolset }))] }))] }, provider.name));
        }) }));
}
