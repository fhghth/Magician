import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SanitizedInput } from '@/components/ui/sanitized-input';
import { useI18n } from '@/i18n';
import { gitRef } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { notifyError } from '@/store/notifications';
import { copyPath, listRepoBranches, revealPath, startWorkInRepo, switchBranchInRepo } from '@/store/projects';
import { SidebarCount, SidebarRowLead } from '../chrome';
// Branch/worktree labels routinely share a long prefix (`bb/coding-context-…`),
// so plain end-truncation (`truncate`) hides exactly the suffix that tells two
// lanes apart — both render as "bb/coding-context…". Keep the tail pinned and
// ellipsize the HEAD instead, so `…context-facts-rpc` and `…context-persona`
// stay distinguishable. Falls back to whole-string for short labels.
function LaneLabel({ label, title }) {
    const tailLen = Math.min(14, Math.floor(label.length / 2));
    const head = label.slice(0, label.length - tailLen);
    const tail = label.slice(label.length - tailLen);
    return (_jsxs("span", { className: "flex min-w-0", title: title, children: [_jsx("span", { className: "truncate", children: head }), _jsx("span", { className: "shrink-0 whitespace-pre", children: tail })] }));
}
const branchActionLabel = (branch, copy) => {
    if (branch.checkedOut) {
        return copy.branchOpenExisting;
    }
    return branch.isDefault ? copy.branchSwitchHome : copy.branchCreateWorktree;
};
// "+" affordance shared by repo and worktree headers — reveals on header hover.
export function WorkspaceAddButton({ label, onClick }) {
    return (_jsx("button", { "aria-label": label, className: "grid size-4 shrink-0 place-items-center rounded-sm bg-transparent text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/workspace:opacity-100", onClick: onClick, type: "button", children: _jsx(Codicon, { name: "add", size: "0.75rem" }) }));
}
// Reveals the next page of already-loaded rows within a workspace/worktree.
export function WorkspaceShowMoreButton({ count, label, onClick }) {
    const { t } = useI18n();
    const text = t.sidebar.showMoreIn(count, label);
    return (_jsx("button", { "aria-label": text, className: "ml-auto grid size-5 place-items-center rounded-sm bg-transparent text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground", onClick: onClick, type: "button", children: _jsx(Codicon, { name: "ellipsis", size: "0.75rem" }) }));
}
// Per-worktree actions (linked worktree lanes only), mirroring the session row
// and ProjectMenu kebab: reveal in the file manager, copy path, and remove the
// worktree (runs a real `git worktree remove` via the caller's confirm dialog).
export function WorkspaceMenu({ path, onRemove }) {
    const { t } = useI18n();
    const p = t.sidebar.projects;
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { "aria-label": p.menu, className: "grid size-4 shrink-0 place-items-center rounded-sm bg-transparent text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/workspace:opacity-100 data-[state=open]:opacity-100", onClick: event => event.stopPropagation(), type: "button", children: _jsx(Codicon, { name: "kebab-vertical", size: "0.75rem" }) }) }), _jsxs(DropdownMenuContent, { align: "end", className: "w-48", sideOffset: 6, children: [_jsxs(DropdownMenuItem, { disabled: !path, onSelect: () => void revealPath(path), children: [_jsx(Codicon, { name: "folder-opened", size: "0.875rem" }), _jsx("span", { children: p.reveal })] }), _jsxs(DropdownMenuItem, { disabled: !path, onSelect: () => void copyPath(path), children: [_jsx(Codicon, { name: "copy", size: "0.875rem" }), _jsx("span", { children: p.copyPath })] }), _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuItem, { onSelect: onRemove, variant: "destructive", children: [_jsx(Codicon, { name: "trash", size: "0.875rem" }), _jsx("span", { children: `${p.removeWorktree}…` })] })] })] }));
}
// "New worktree": prompt for a branch name, then git spins up a fresh worktree
// for that branch under the repo (the lightest way) and we open a new session
// inside it. Naming is explicit — no auto-generated `hermes/work-<ts>` trees.
export function StartWorkButton({ repoPath, onStarted }) {
    const { t } = useI18n();
    const s = t.sidebar;
    const p = s.projects;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [pending, setPending] = useState(false);
    const [convertMode, setConvertMode] = useState(false);
    const [branches, setBranches] = useState([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const loadBranches = useCallback(async () => {
        if (!repoPath) {
            return;
        }
        setBranchesLoading(true);
        try {
            setBranches(await listRepoBranches(repoPath));
        }
        catch {
            setBranches([]);
        }
        finally {
            setBranchesLoading(false);
        }
    }, [repoPath]);
    const submit = async () => {
        const branch = name.trim();
        if (pending || !repoPath || !branch) {
            return;
        }
        setPending(true);
        try {
            // Pass the typed value as both the dir slug source and the branch, so the
            // branch is exactly what the user named (the dir is slugified git-side).
            const result = await startWorkInRepo(repoPath, { branch, name: branch });
            if (result) {
                onStarted(result.path);
                setOpen(false);
                setName('');
            }
        }
        catch (err) {
            notifyError(err, p.startWorkFailed);
        }
        finally {
            setPending(false);
        }
    };
    const convert = async (branch) => {
        if (pending || !repoPath || !branch) {
            return;
        }
        setPending(true);
        try {
            let result;
            if (branch.worktreePath) {
                result = { branch: branch.name, path: branch.worktreePath };
            }
            else if (branch.isDefault) {
                await switchBranchInRepo(repoPath, branch.name);
                result = { branch: branch.name, path: repoPath };
            }
            else {
                result = await startWorkInRepo(repoPath, { existingBranch: branch.name });
            }
            if (result) {
                onStarted(result.path);
                setOpen(false);
            }
        }
        catch (err) {
            notifyError(err, p.startWorkFailed);
        }
        finally {
            setPending(false);
        }
    };
    const enterConvert = () => {
        setConvertMode(true);
        void loadBranches();
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { "aria-label": p.startWork, className: "grid size-4 shrink-0 place-items-center rounded-sm bg-transparent text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100", onClick: () => {
                    setConvertMode(false);
                    setName('');
                    setOpen(true);
                }, type: "button", children: _jsx(Codicon, { name: "git-branch", size: "0.75rem" }) }), _jsx(Dialog, { onOpenChange: next => !pending && setOpen(next), open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: convertMode ? p.convertBranchTitle : p.newWorktreeTitle }), _jsx(DialogDescription, { children: convertMode ? p.convertBranchDesc : p.newWorktreeDesc })] }), convertMode ? (_jsxs(Command, { className: "rounded-md border border-(--ui-stroke-tertiary)", filter: (value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0), children: [_jsx(CommandInput, { autoFocus: true, disabled: pending, placeholder: p.convertBranchPlaceholder }), _jsxs(CommandList, { className: "max-h-64", children: [_jsx(CommandEmpty, { children: branchesLoading ? p.branchesLoading : p.noBranches }), _jsx(CommandGroup, { children: branches.map(branch => (_jsxs(CommandItem, { disabled: pending, onSelect: () => void convert(branch), value: branch.name, children: [_jsx(Codicon, { className: "shrink-0 text-(--ui-text-tertiary)", name: "git-branch", size: "0.8rem" }), _jsx("span", { className: "truncate", children: branch.name }), _jsx("span", { className: "ml-auto shrink-0 text-[0.625rem] text-(--ui-text-tertiary)", children: branchActionLabel(branch, p) })] }, branch.name))) })] })] })) : (_jsx(SanitizedInput, { autoFocus: true, disabled: pending, onKeyDown: event => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void submit();
                                }
                                else if (event.key === 'Escape') {
                                    setOpen(false);
                                }
                            }, onValueChange: setName, placeholder: p.branchPlaceholder, sanitize: gitRef, value: name })), convertMode ? (_jsx(DialogFooter, { className: "sm:justify-start", children: _jsx(Button, { className: "px-0 text-(--ui-text-secondary) hover:text-foreground", disabled: pending, onClick: () => setConvertMode(false), type: "button", variant: "link", children: t.common.cancel }) })) : (_jsxs(DialogFooter, { className: "sm:justify-between", children: [_jsx(Button, { className: "px-0 text-(--ui-text-secondary) hover:text-foreground", disabled: pending, onClick: enterConvert, type: "button", variant: "link", children: p.convertBranchInstead }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { disabled: pending, onClick: () => setOpen(false), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: pending || !name.trim(), onClick: () => void submit(), type: "button", children: p.startWork })] })] }))] }) })] }));
}
// Collapsible header shared by the repo (emphasis) and worktree levels: a toggle
// button with a leading glyph, plus an optional trailing action (the +).
export function WorkspaceHeader({ action, count, emphasis = false, icon, label, onToggle, open, title }) {
    return (_jsxs("div", { className: cn('group/workspace flex min-h-6 items-center gap-1 px-2 pt-1 text-[0.6875rem]', emphasis ? 'font-semibold text-(--ui-text-secondary)' : 'font-medium text-(--ui-text-tertiary)'), children: [_jsxs("button", { className: cn('flex min-w-0 flex-1 items-center gap-1.5 bg-transparent text-left', emphasis ? 'hover:text-foreground' : 'hover:text-(--ui-text-secondary)'), onClick: onToggle, type: "button", children: [_jsx(SidebarRowLead, { children: icon }), _jsx(LaneLabel, { label: label, title: title ? `${label}\n${title}` : label }), _jsx("span", { className: "shrink-0", children: _jsx(SidebarCount, { children: count }) }), _jsx(DisclosureCaret, { className: "shrink-0 text-(--ui-text-tertiary) opacity-0 transition group-hover/workspace:opacity-100", open: open })] }), action] }));
}
