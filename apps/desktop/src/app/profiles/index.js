import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from '@/components/chat/code-editor';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SanitizedInput } from '@/components/ui/sanitized-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createProfile, deleteProfile, getProfileSoul, renameProfile, updateProfileSoul } from '@/hermes';
import { useI18n } from '@/i18n';
import { AlertTriangle, Save } from '@/lib/icons';
import { profileColorSoft, resolveProfileColor } from '@/lib/profile-color';
import { slug } from '@/lib/sanitize';
import { normalize } from '@/lib/text';
import { cn } from '@/lib/utils';
import { notify, notifyError } from '@/store/notifications';
import { $profileColors, refreshProfiles } from '@/store/profile';
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey';
import { Panel, PanelAddButton, PanelBody, PanelDetail, PanelEmpty, PanelHeader, PanelList, PanelListRow, PanelMeta, PanelPill, PanelRowMenu, PanelSectionLabel } from '../overlays/panel';
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function isValidProfileName(name) {
    return PROFILE_NAME_RE.test(name.trim());
}
export function ProfilesView({ onClose }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [profiles, setProfiles] = useState(null);
    const [selectedName, setSelectedName] = useState(null);
    const [query, setQuery] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [pendingRename, setPendingRename] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const refresh = useCallback(async () => {
        try {
            const list = await refreshProfiles();
            setProfiles(list);
            setSelectedName(current => {
                if (current && list.some(p => p.name === current)) {
                    return current;
                }
                return list.find(p => p.is_default)?.name ?? list[0]?.name ?? null;
            });
        }
        catch (err) {
            notifyError(err, p.failedLoad);
        }
    }, [p]);
    useRefreshHotkey(refresh);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const selected = useMemo(() => {
        if (!profiles) {
            return null;
        }
        return profiles.find(p => p.name === selectedName) ?? profiles[0] ?? null;
    }, [profiles, selectedName]);
    const visibleProfiles = useMemo(() => {
        const q = normalize(query);
        if (!profiles || !q) {
            return profiles ?? [];
        }
        return profiles.filter(profile => profile.name.toLowerCase().includes(q) || (profile.model ?? '').toLowerCase().includes(q));
    }, [profiles, query]);
    const handleCreate = useCallback(async (name, cloneFrom) => {
        const trimmed = name.trim();
        if (!isValidProfileName(trimmed)) {
            throw new Error(p.nameHint);
        }
        await createProfile({ name: trimmed, clone_from: cloneFrom });
        notify({ kind: 'success', title: p.created, message: trimmed });
        setSelectedName(trimmed);
        await refresh();
    }, [p, refresh]);
    const handleRename = useCallback(async (from, to) => {
        const target = to.trim();
        if (target === from) {
            return;
        }
        if (!isValidProfileName(target)) {
            throw new Error(p.nameHint);
        }
        await renameProfile(from, target);
        notify({ kind: 'success', title: p.renamed, message: `${from} → ${target}` });
        setSelectedName(target);
        await refresh();
    }, [p, refresh]);
    const handleConfirmDelete = useCallback(async () => {
        if (!pendingDelete) {
            return;
        }
        setDeleting(true);
        try {
            await deleteProfile(pendingDelete.name);
            notify({ kind: 'success', title: p.deleted, message: pendingDelete.name });
            setPendingDelete(null);
            setSelectedName(null);
            await refresh();
        }
        catch (err) {
            notifyError(err, p.failedDelete);
        }
        finally {
            setDeleting(false);
        }
    }, [p, pendingDelete, refresh]);
    return (_jsxs(Panel, { closeLabel: p.close, onClose: onClose, children: [!profiles ? (_jsx(PageLoader, { label: p.loading })) : profiles.length === 0 ? (_jsx(PanelEmpty, { action: _jsx(Button, { onClick: () => setCreateOpen(true), size: "sm", children: p.newProfile }), description: p.createDesc, icon: "organization", title: p.noProfiles })) : (_jsxs(_Fragment, { children: [_jsx(PanelHeader, { subtitle: p.count(profiles.length), title: p.title }), _jsxs(PanelBody, { children: [_jsxs(PanelList, { onSearchChange: setQuery, searchLabel: p.search, searchPlaceholder: p.search, searchValue: query, children: [visibleProfiles.map(profile => (_jsx(ProfileRow, { active: selected?.name === profile.name, menu: _jsx(PanelRowMenu, { items: profile.is_default
                                                ? []
                                                : [
                                                    { icon: 'edit', label: p.renameMenu, onSelect: () => setPendingRename(profile) },
                                                    {
                                                        icon: 'trash',
                                                        label: t.common.delete,
                                                        onSelect: () => setPendingDelete(profile),
                                                        tone: 'danger'
                                                    }
                                                ] }), onSelect: () => setSelectedName(profile.name), profile: profile }, profile.name))), _jsx(PanelAddButton, { label: p.newProfile, onClick: () => setCreateOpen(true) })] }), selected ? (_jsx(ProfileDetail, { profile: selected }, selected.name)) : (_jsx(PanelEmpty, { description: p.selectPrompt, icon: "account" }))] })] })), _jsx(RenameProfileDialog, { currentName: pendingRename?.name ?? '', onClose: () => setPendingRename(null), onRename: async (newName) => {
                    if (pendingRename) {
                        await handleRename(pendingRename.name, newName);
                        setPendingRename(null);
                    }
                }, open: pendingRename !== null }), _jsx(CreateProfileDialog, { onClose: () => setCreateOpen(false), onCreate: async (name, cloneFrom) => handleCreate(name, cloneFrom), open: createOpen, profiles: profiles ?? [] }), _jsx(Dialog, { onOpenChange: open => !open && !deleting && setPendingDelete(null), open: pendingDelete !== null, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: p.deleteTitle }), _jsx(DialogDescription, { children: pendingDelete ? (_jsxs(_Fragment, { children: [p.deleteDescPrefix, _jsx("span", { className: "font-medium text-foreground", children: pendingDelete.name }), p.deleteDescMid, _jsx("span", { className: "font-mono text-xs", children: pendingDelete.path }), p.deleteDescSuffix] })) : null })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: deleting, onClick: () => setPendingDelete(null), variant: "outline", children: t.common.cancel }), _jsx(Button, { disabled: deleting, onClick: () => void handleConfirmDelete(), variant: "destructive", children: deleting ? p.deleting : t.common.delete })] })] }) })] }));
}
function ProfileRow({ active, menu, onSelect, profile }) {
    const colors = useStore($profileColors);
    return (_jsx(PanelListRow, { active: active, lead: _jsx(ProfileGlyph, { color: resolveProfileColor(profile.name, colors), isDefault: profile.is_default, name: profile.name }), menu: menu, onSelect: onSelect, rowKey: profile.name, title: profile.name }));
}
// Leading glyph for a profile row, mirroring the sidebar rail: the default
// profile gets the `home` icon; named profiles get a soft color-tinted square
// with their initial in the profile's color.
function ProfileGlyph({ color, isDefault, name }) {
    if (isDefault) {
        return _jsx(Codicon, { className: "shrink-0 text-muted-foreground/70", name: "home", size: "0.9rem" });
    }
    const hue = color ?? 'var(--ui-text-quaternary)';
    const initial = name
        .replace(/[^a-z0-9]/gi, '')
        .charAt(0)
        .toUpperCase() || '?';
    return (_jsx("span", { "aria-hidden": "true", className: "grid size-4 shrink-0 place-items-center rounded-[3px] text-[0.5rem] font-semibold uppercase leading-none", style: { backgroundColor: profileColorSoft(hue, 22), color: color ?? undefined }, children: initial }));
}
function ProfileDetail({ profile }) {
    const { t } = useI18n();
    const p = t.profiles;
    return (_jsxs(PanelDetail, { children: [_jsxs("header", { className: "space-y-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("h3", { className: "text-[0.95rem] font-semibold tracking-tight text-foreground", children: profile.name }), profile.is_default && _jsx(PanelPill, { tone: "good", children: p.defaultBadge }), profile.has_env && _jsx(PanelPill, { tone: "muted", children: ".env" })] }), _jsx("p", { className: "mt-1 truncate font-mono text-[0.66rem] text-muted-foreground/55", title: profile.path, children: profile.path })] }), _jsx(PanelMeta, { rows: [
                            {
                                label: p.modelLabel,
                                value: profile.model ? (_jsxs("span", { className: "font-mono", children: [profile.model, profile.provider ? _jsxs("span", { className: "text-muted-foreground/55", children: [" \u00B7 ", profile.provider] }) : null] })) : (_jsx("span", { className: "text-muted-foreground/55", children: p.notSet }))
                            },
                            { label: p.skillsLabel, value: profile.skill_count }
                        ] })] }), _jsx(SoulEditor, { profileName: profile.name })] }));
}
function SoulEditor({ profileName }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [content, setContent] = useState('');
    const [original, setOriginal] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const requestRef = useRef(profileName);
    useEffect(() => {
        requestRef.current = profileName;
        setLoading(true);
        setError(null);
        setContent('');
        setOriginal('');
        void (async () => {
            try {
                const soul = await getProfileSoul(profileName);
                if (requestRef.current === profileName) {
                    setContent(soul.content);
                    setOriginal(soul.content);
                }
            }
            catch (err) {
                if (requestRef.current === profileName) {
                    setError(err instanceof Error ? err.message : p.failedLoadSoul);
                }
            }
            finally {
                if (requestRef.current === profileName) {
                    setLoading(false);
                }
            }
        })();
    }, [p, profileName]);
    const dirty = content !== original;
    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            await updateProfileSoul(profileName, content);
            setOriginal(content);
            notify({ kind: 'success', title: p.soulSaved, message: profileName });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : p.failedSaveSoul);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("section", { className: "space-y-2", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsxs("div", { children: [_jsx(PanelSectionLabel, { className: "text-[0.7rem] tracking-[0.14em]", children: "SOUL.md" }), _jsx("p", { className: "text-xs text-muted-foreground", children: p.soulDesc })] }), dirty && _jsx("span", { className: "text-[0.65rem] text-muted-foreground", children: p.unsavedChanges })] }), loading ? (_jsx(PageLoader, { className: "min-h-44", label: p.loadingSoul })) : (_jsx("div", { className: "min-h-48", children: _jsx(CodeEditor, { filePath: "SOUL.md", framed: true, initialValue: content, onChange: setContent, onSave: () => void handleSave() }, profileName) })), error && (_jsxs("div", { className: "flex items-start gap-2 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsx("div", { className: "flex justify-end", children: _jsxs(Button, { disabled: !dirty || saving || loading, onClick: () => void handleSave(), size: "sm", children: [_jsx(Save, {}), saving ? p.saving : p.saveSoul] }) })] }));
}
function CreateProfileDialog({ onClose, onCreate, open, profiles }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [name, setName] = useState('');
    const [cloneFrom, setCloneFrom] = useState('default');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        setName('');
        setCloneFrom('default');
        setError(null);
        setSaving(false);
    }, [open]);
    const trimmed = name.trim();
    const invalid = trimmed !== '' && !isValidProfileName(trimmed);
    async function handleSubmit(event) {
        event.preventDefault();
        if (!trimmed || invalid) {
            setError(invalid ? p.invalidName(p.nameHint) : p.nameRequired);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onCreate(trimmed, cloneFrom);
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : p.failedCreate);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !saving && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: p.newProfile }), _jsx(DialogDescription, { children: p.createDesc })] }), _jsxs("form", { className: "grid gap-4", onSubmit: handleSubmit, children: [_jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "new-profile-name", children: p.nameLabel }), _jsx(SanitizedInput, { "aria-invalid": invalid, autoFocus: true, id: "new-profile-name", onValueChange: setName, placeholder: "my-profile", sanitize: slug, value: name }), _jsx("p", { className: cn('text-[0.66rem] leading-4', invalid ? 'text-destructive' : 'text-muted-foreground'), children: p.nameHint })] }), _jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "new-profile-clone-from", children: p.cloneFrom }), _jsxs(Select, { onValueChange: value => setCloneFrom(value === '__none__' ? null : value), value: cloneFrom ?? '__none__', children: [_jsx(SelectTrigger, { className: "h-9 rounded-md", id: "new-profile-clone-from", children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "__none__", children: p.cloneFromNone }), profiles.map(profile => (_jsx(SelectItem, { value: profile.name, children: profile.name }, profile.name)))] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: p.cloneFromDesc })] }), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: saving, onClick: onClose, type: "button", variant: "outline", children: t.common.cancel }), _jsx(Button, { disabled: saving || !trimmed || invalid, type: "submit", children: saving ? p.creating : p.createAction })] })] })] }) }));
}
function RenameProfileDialog({ currentName, onClose, onRename, open }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [name, setName] = useState(currentName);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        setName(currentName);
        setError(null);
        setSaving(false);
    }, [currentName, open]);
    const trimmed = name.trim();
    const unchanged = trimmed === currentName;
    const invalid = trimmed !== '' && !unchanged && !isValidProfileName(trimmed);
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
        setSaving(true);
        setError(null);
        try {
            await onRename(trimmed);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : p.failedRename);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !saving && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: p.renameTitle }), _jsxs(DialogDescription, { children: [p.renameDescPrefix, _jsx("span", { className: "font-mono", children: "~/.local/bin" }), p.renameDescSuffix] })] }), _jsxs("form", { className: "grid gap-3", onSubmit: handleSubmit, children: [_jsxs("div", { className: "grid gap-1.5", children: [_jsx("label", { className: "text-xs font-medium", htmlFor: "rename-profile-name", children: p.newNameLabel }), _jsx(SanitizedInput, { "aria-invalid": invalid, autoFocus: true, id: "rename-profile-name", onValueChange: setName, sanitize: slug, value: name }), _jsx("p", { className: cn('text-[0.66rem] leading-4', invalid ? 'text-destructive' : 'text-muted-foreground'), children: p.nameHint })] }), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: saving, onClick: onClose, type: "button", variant: "outline", children: t.common.cancel }), _jsx(Button, { disabled: saving || invalid || unchanged, type: "submit", children: saving ? p.renaming : p.rename })] })] })] }) }));
}
