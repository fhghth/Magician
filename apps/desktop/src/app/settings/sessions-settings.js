import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { deleteSession, listAllProfileSessions, setSessionArchived } from '@/hermes';
import { useI18n } from '@/i18n';
import { sessionTitle } from '@/lib/chat-runtime';
import { triggerHaptic } from '@/lib/haptics';
import { Archive, ArchiveOff, FolderOpen, Loader2, Trash2 } from '@/lib/icons';
import { notify, notifyError } from '@/store/notifications';
import { untombstoneSessions } from '@/store/projects';
import { applyConfiguredDefaultProjectDir, ensureDefaultWorkspaceCwd, setSessions } from '@/store/session';
import { EmptyState, ListRow, LoadingState, SectionHeading, SettingsContent } from './primitives';
import { useDeepLinkHighlight } from './use-deep-link-highlight';
const ARCHIVED_FETCH_LIMIT = 200;
function workspaceLabel(cwd) {
    const path = cwd?.trim();
    if (!path) {
        return '';
    }
    return (path
        .replace(/[/\\]+$/, '')
        .split(/[/\\]/)
        .filter(Boolean)
        .pop() ?? path);
}
export function SessionsSettings() {
    const { t } = useI18n();
    const s = t.settings.sessions;
    const [sessions, setLocalSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listAllProfileSessions(ARCHIVED_FETCH_LIMIT, 0, 'only');
            setLocalSessions(result.sessions);
        }
        catch (err) {
            notifyError(err, s.failedLoad);
        }
        finally {
            setLoading(false);
        }
    }, [s.failedLoad]);
    useEffect(() => {
        void load();
    }, [load]);
    const unarchive = useCallback(async (session) => {
        setBusyId(session.id);
        try {
            await setSessionArchived(session.id, false, session.profile);
            setLocalSessions(prev => prev.filter(s => s.id !== session.id));
            // Surface it again in the sidebar without waiting for a full refresh, and
            // lift any optimistic eviction so the grouped tree shows it again too.
            untombstoneSessions([session.id, session._lineage_root_id]);
            setSessions(prev => [{ ...session, archived: false }, ...prev.filter(s => s.id !== session.id)]);
            triggerHaptic('selection');
            notify({ durationMs: 2_000, kind: 'success', message: s.restored });
        }
        catch (err) {
            notifyError(err, s.unarchiveFailed);
        }
        finally {
            setBusyId(null);
        }
    }, [s]);
    const remove = useCallback(async (session) => {
        if (!window.confirm(s.deleteConfirm(sessionTitle(session)))) {
            return;
        }
        setBusyId(session.id);
        try {
            await deleteSession(session.id, session.profile);
            setLocalSessions(prev => prev.filter(s => s.id !== session.id));
            triggerHaptic('warning');
        }
        catch (err) {
            notifyError(err, s.deleteFailed);
        }
        finally {
            setBusyId(null);
        }
    }, [s]);
    useDeepLinkHighlight({
        elementId: id => `archived-session-${id}`,
        param: 'session',
        ready: id => !loading && sessions.some(session => session.id === id)
    });
    if (loading) {
        return _jsx(LoadingState, { label: s.loading });
    }
    return (_jsxs(SettingsContent, { children: [_jsx(DefaultProjectDirSetting, {}), _jsx(SectionHeading, { icon: Archive, meta: sessions.length ? String(sessions.length) : undefined, title: s.archivedTitle }), _jsx("p", { className: "mb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: s.archivedIntro }), sessions.length === 0 ? (_jsx(EmptyState, { description: s.emptyArchivedDesc, title: s.emptyArchivedTitle })) : (_jsx("div", { className: "grid gap-1", children: sessions.map(session => {
                    const label = workspaceLabel(session.cwd);
                    const busy = busyId === session.id;
                    return (_jsx("div", { className: "scroll-mt-6 rounded-lg", id: `archived-session-${session.id}`, children: _jsx(ListRow, { action: _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsxs(Button, { disabled: busy, onClick: () => void unarchive(session), size: "sm", type: "button", variant: "textStrong", children: [busy ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(ArchiveOff, { className: "size-3.5" }), _jsx("span", { children: s.unarchive })] }), _jsx(Tip, { label: s.deletePermanently, children: _jsx(Button, { "aria-label": s.deletePermanently, className: "text-muted-foreground hover:text-destructive", disabled: busy, onClick: () => void remove(session), size: "icon", type: "button", variant: "ghost", children: _jsx(Trash2, { className: "size-3.5" }) }) })] }), description: session.preview || undefined, hint: label ? `${label} · ${s.messages(session.message_count)}` : s.messages(session.message_count), title: sessionTitle(session) }) }, session.id));
                }) }))] }));
}
// Lets the user pin the default cwd for new sessions. Without this, packaged
// builds on Windows used to spawn sessions in the install dir (`win-unpacked`
// / Program Files), which buried any files Hermes wrote there.
function DefaultProjectDirSetting() {
    const { t } = useI18n();
    const s = t.settings.sessions;
    const [dir, setDir] = useState(null);
    const [fallback, setFallback] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        // The bridge is only present when running inside Electron. In a Vitest
        // / Storybook / non-Electron context `window.hermesDesktop` is
        // undefined, so guard the WHOLE call chain rather than chaining
        // `?.settings.getDefaultProjectDir().then(...)` (the latter would
        // short-circuit to `undefined.then(...)` and throw at runtime).
        const settings = window.hermesDesktop?.settings;
        if (!settings) {
            return;
        }
        let alive = true;
        void settings.getDefaultProjectDir().then(result => {
            if (!alive) {
                return;
            }
            setDir(result.dir);
            setFallback(result.defaultLabel);
            applyConfiguredDefaultProjectDir(result.dir);
        });
        return () => {
            alive = false;
        };
    }, []);
    const choose = useCallback(async () => {
        const settings = window.hermesDesktop?.settings;
        if (!settings) {
            return;
        }
        setBusy(true);
        try {
            const picked = await settings.pickDefaultProjectDir();
            if (picked.canceled || !picked.dir) {
                return;
            }
            const result = await settings.setDefaultProjectDir(picked.dir);
            setDir(result.dir);
            applyConfiguredDefaultProjectDir(result.dir);
            notify({ durationMs: 4_000, kind: 'success', message: s.defaultDirUpdated });
        }
        catch (err) {
            notifyError(err, s.updateDirFailed);
        }
        finally {
            setBusy(false);
        }
    }, [s]);
    const clear = useCallback(async () => {
        const settings = window.hermesDesktop?.settings;
        if (!settings) {
            return;
        }
        setBusy(true);
        try {
            await settings.setDefaultProjectDir(null);
            setDir(null);
            applyConfiguredDefaultProjectDir(null);
            await ensureDefaultWorkspaceCwd();
        }
        catch (err) {
            notifyError(err, s.clearDirFailed);
        }
        finally {
            setBusy(false);
        }
    }, [s]);
    return (_jsxs("div", { className: "mb-6", children: [_jsx(SectionHeading, { icon: FolderOpen, title: s.defaultDirTitle }), _jsx("p", { className: "mb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: s.defaultDirDesc }), _jsx(ListRow, { action: _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs(Button, { disabled: busy, onClick: () => void choose(), size: "sm", type: "button", variant: "textStrong", children: [_jsx(FolderOpen, { className: "size-3.5" }), _jsx("span", { children: dir ? s.change : s.choose })] }), dir && (_jsx(Button, { disabled: busy, onClick: () => void clear(), size: "sm", type: "button", variant: "text", children: s.clear }))] }), description: dir || s.defaultsTo(fallback || '~'), title: dir ? dir : s.notSet })] }));
}
