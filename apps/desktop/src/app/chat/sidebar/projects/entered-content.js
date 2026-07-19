import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { $dismissedWorktreeIds, dismissWorktree } from '@/store/layout';
import { notifyError } from '@/store/notifications';
import { removeWorktreePath } from '@/store/projects';
import { SidebarRowStack } from '../chrome';
import { useWorkspaceNodeOpen } from './model';
import { SidebarWorkspaceGroup } from './workspace-group';
import { mergeRepoWorktreeGroups, overlayRepoLanes } from './workspace-groups';
import { WorkspaceAddButton, WorkspaceHeader } from './workspace-header';
// The entered project's body. Main-checkout sessions render directly — no
// redundant repo/branch header (the breadcrumb already names the project). Only
// linked worktrees nest, shown by branch. Multi-folder projects keep per-repo
// headers so the folders stay distinguishable.
export function EnteredProjectContent({ project, renderRows, onNewSession, repoWorktrees, liveSessions, removedSessionIds }) {
    if (!project.repos.length) {
        return null;
    }
    const single = project.repos.length === 1;
    return (_jsx(_Fragment, { children: project.repos.map(repo => (_jsx(RepoFlatSection, { discoveredWorktrees: repo.path ? repoWorktrees?.[repo.path] : undefined, liveSessions: liveSessions, onNewSession: onNewSession, removedSessionIds: removedSessionIds, renderRows: renderRows, repo: repo, showHeader: !single }, repo.id))) }));
}
function RepoFlatSection({ repo, showHeader, renderRows, onNewSession, discoveredWorktrees, liveSessions, removedSessionIds }) {
    const { t } = useI18n();
    const s = t.sidebar;
    const [open, toggleOpen] = useWorkspaceNodeOpen(repo.id);
    const dismissedWorktrees = useStore($dismissedWorktreeIds);
    // The repo's session lanes already come fully built from the backend; this
    // only injects empty VISUAL lanes from a live `git worktree list`.
    const mergedGroups = useMemo(() => mergeRepoWorktreeGroups(repo, discoveredWorktrees), [repo, discoveredWorktrees]);
    // Optimistic placement runs against the MERGED lane set (backend + visual
    // git-worktree lanes) so out-of-tree/sibling worktrees — which exist as visual
    // lanes before the snapshot carries their sessions — get the new row. The
    // overlay drops lanes it empties, so re-merge to restore still-real worktrees.
    const overlaidGroups = useMemo(() => {
        if (!(liveSessions?.length || removedSessionIds?.size)) {
            return mergedGroups;
        }
        const { groups } = overlayRepoLanes({ ...repo, groups: mergedGroups }, liveSessions ?? [], removedSessionIds);
        return mergeRepoWorktreeGroups({ id: repo.id, path: repo.path, groups }, discoveredWorktrees);
    }, [repo, mergedGroups, discoveredWorktrees, liveSessions, removedSessionIds]);
    const discoveredWorktreePaths = useMemo(() => new Set((discoveredWorktrees ?? [])
        .map(worktree => worktree.path?.trim())
        .filter((path) => Boolean(path))), [discoveredWorktrees]);
    // Main lanes are always visible; linked worktrees can be user-dismissed.
    // A live `git worktree list` hit wins over an old dismissal: if git says the
    // worktree exists again (or still exists after "hide from sidebar"), surface it.
    const ordered = overlaidGroups.filter(group => group.isMain || !dismissedWorktrees.includes(group.id) || (group.path && discoveredWorktreePaths.has(group.path)));
    const repoCount = ordered.reduce((sum, group) => sum + group.sessions.length, 0);
    // Removal asks how: actually `git worktree remove` it, or just hide the lane
    // and leave the worktree on disk. A dirty worktree escalates to a force prompt
    // instead of erroring (those changes are usually throwaway).
    const [removeTarget, setRemoveTarget] = useState(null);
    const [forceTarget, setForceTarget] = useState(null);
    const removeViaGit = async (group, force = false) => {
        if (!repo.path || !group.path) {
            return;
        }
        try {
            await removeWorktreePath(repo.path, group.path, { force });
            dismissWorktree(group.id);
        }
        catch (err) {
            // git refuses a non-force remove on a dirty/locked worktree — offer force
            // rather than dead-ending on an error toast.
            if (!force && /force|modified|untracked|dirty|locked|contains/i.test(String(err?.message ?? ''))) {
                setForceTarget(group);
            }
            else {
                notifyError(err, s.projects.removeWorktreeFailed);
            }
        }
    };
    const body = (_jsx(_Fragment, { children: ordered.map(group => (_jsx(SidebarWorkspaceGroup, { group: group, 
            // The kanban bucket is read-only: it aggregates many task worktrees, so
            // "new session here" and "remove worktree" have no single target.
            onNewSession: group.isKanban ? undefined : onNewSession, onRemove: group.isMain || group.isKanban ? undefined : () => setRemoveTarget(group), renderRows: renderRows }, group.id))) }));
    // Both removal prompts share the shape (hide-from-sidebar + cancel + a
    // destructive action); only the copy and the destructive handler differ.
    const worktreeDialog = (target, setTarget, description, destructiveLabel, onDestructive) => (_jsx(Dialog, { onOpenChange: isOpen => !isOpen && setTarget(null), open: Boolean(target), children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: `${s.projects.removeWorktree} "${target?.label ?? ''}"?` }), _jsx(DialogDescription, { children: description })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: () => setTarget(null), variant: "ghost", children: t.common.cancel }), _jsx(Button, { onClick: () => {
                                if (target) {
                                    dismissWorktree(target.id);
                                }
                                setTarget(null);
                            }, variant: "secondary", children: s.projects.removeFromSidebar }), _jsx(Button, { onClick: () => {
                                setTarget(null);
                                if (target) {
                                    onDestructive(target);
                                }
                            }, variant: "destructive", children: destructiveLabel })] })] }) }));
    const removeDialog = (_jsxs(_Fragment, { children: [worktreeDialog(removeTarget, setRemoveTarget, s.projects.removeWorktreeConfirm, s.projects.removeWorktree, group => void removeViaGit(group)), worktreeDialog(forceTarget, setForceTarget, s.projects.removeWorktreeDirty, s.projects.forceRemove, group => void removeViaGit(group, true))] }));
    if (!showHeader) {
        return (_jsxs(_Fragment, { children: [body, removeDialog] }));
    }
    return (_jsxs(SidebarRowStack, { children: [_jsx(WorkspaceHeader, { action: onNewSession && (_jsx(WorkspaceAddButton, { label: s.newSessionIn(repo.label), onClick: () => onNewSession(repo.path) })), count: repoCount, emphasis: true, icon: _jsx(Codicon, { className: "shrink-0 text-(--ui-text-tertiary)", name: "repo", size: "0.75rem" }), label: repo.label, onToggle: toggleOpen, open: open, title: repo.path ?? undefined }), open && _jsx(SidebarRowStack, { className: "pl-2.5", children: body }), removeDialog] }));
}
