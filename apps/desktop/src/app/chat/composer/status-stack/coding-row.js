import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StatusRow } from '@/components/chat/status-row';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiffCount } from '@/components/ui/diff-count';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SanitizedInput } from '@/components/ui/sanitized-input';
import { useI18n } from '@/i18n';
import { gitRef } from '@/lib/sanitize';
import { $repoStatus, $repoWorktrees } from '@/store/coding-status';
import { notifyError } from '@/store/notifications';
import { $newWorktreeRequest } from '@/store/projects';
// Tiny uppercase section header, matching the composer "+" menu's labels.
const MENU_SECTION = 'text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)';
const branchActionLabel = (branch, copy) => {
    if (branch.checkedOut) {
        return copy.branchOpenExisting;
    }
    return branch.isDefault ? copy.branchSwitchHome : copy.branchCreateWorktree;
};
/**
 * The always-on coding-context row, the BASE of the composer status stack:
 * current branch, dirty summary (+/-), and ahead/behind. A touch more prominent
 * than the per-turn rows above it (larger branch label, accent glyph), and the
 * entry point to the review pane. Hidden when the active session isn't in a
 * local git repo (the probe returns null).
 */
export const CodingStatusRow = memo(function CodingStatusRow({ onBranchOff, onConvertBranch, onListBranches, onOpen, onOpenWorktree, onSwitchBranch }) {
    const { t } = useI18n();
    const s = t.statusStack.coding;
    const p = t.sidebar.projects;
    const status = useStore($repoStatus);
    const worktrees = useStore($repoWorktrees);
    const [branchOpen, setBranchOpen] = useState(false);
    const [branchName, setBranchName] = useState('');
    const [branchBase, setBranchBase] = useState(undefined);
    const [branchPending, setBranchPending] = useState(false);
    const [convertMode, setConvertMode] = useState(false);
    const [branches, setBranches] = useState([]);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const loadBranches = useCallback(async () => {
        if (!onListBranches) {
            return;
        }
        setBranchesLoading(true);
        try {
            setBranches(await onListBranches());
        }
        catch {
            setBranches([]);
        }
        finally {
            setBranchesLoading(false);
        }
    }, [onListBranches]);
    // Open the name dialog for a chosen base. Deferred so the dropdown finishes
    // closing before the dialog grabs focus (Radix focus-trap handoff races
    // otherwise).
    const startBranch = (base) => {
        setBranchBase(base);
        setBranchName('');
        setConvertMode(false);
        setTimeout(() => setBranchOpen(true), 0);
    };
    const startConvert = () => {
        setBranchBase(undefined);
        setBranchName('');
        setConvertMode(true);
        void loadBranches();
        setTimeout(() => setBranchOpen(true), 0);
    };
    const enterConvert = () => {
        setConvertMode(true);
        void loadBranches();
    };
    const convertBranch = async (branch) => {
        if (branchPending || !branch || !onConvertBranch) {
            return;
        }
        setBranchPending(true);
        try {
            await onConvertBranch(branch.name, branch.worktreePath, branch.isDefault);
            setBranchOpen(false);
        }
        catch (err) {
            notifyError(err, p.startWorkFailed);
        }
        finally {
            setBranchPending(false);
        }
    };
    // Global ⌘⇧B (workspace.newWorktree): open the name dialog for a worktree off
    // current HEAD. The rail only renders inside a repo, so the hotkey naturally
    // no-ops elsewhere. Guarded by a token ref so it fires on the keypress, not on
    // mount or unrelated re-renders.
    const worktreeReq = useStore($newWorktreeRequest);
    const lastWorktreeReqRef = useRef(worktreeReq);
    useEffect(() => {
        if (worktreeReq === lastWorktreeReqRef.current) {
            return;
        }
        lastWorktreeReqRef.current = worktreeReq;
        if (!onBranchOff) {
            return;
        }
        setBranchBase(undefined);
        setBranchName('');
        setConvertMode(false);
        setBranchOpen(true);
    }, [onBranchOff, worktreeReq]);
    const submitBranch = async () => {
        const branch = branchName.trim();
        if (branchPending || !branch || !onBranchOff) {
            return;
        }
        setBranchPending(true);
        try {
            await onBranchOff(branch, branchBase);
            setBranchOpen(false);
            setBranchName('');
        }
        catch (err) {
            notifyError(err, p.startWorkFailed);
        }
        finally {
            setBranchPending(false);
        }
    };
    const switchToBranch = async (branch) => {
        if (!onSwitchBranch) {
            return;
        }
        try {
            await onSwitchBranch(branch);
        }
        catch (err) {
            notifyError(err, s.switchFailed(branch));
        }
    };
    if (!status) {
        return null;
    }
    const branchLabel = status.detached ? s.detached : status.branch || s.noBranch;
    // The kebab offers branching off the trunk and/or the current branch. The
    // worktree-add bases the new branch on `base` (a branch name; undefined =
    // current HEAD). We dedupe so "on main" shows a single trunk entry, and fall
    // back to a plain off-HEAD branch when no trunk is detected.
    const current = status.detached ? null : status.branch;
    const branchTargets = [];
    // Current branch first (the 99% "branch off where I am"), then the trunk just
    // below it ("New branch from main"), deduped when they're the same.
    if (current) {
        branchTargets.push({ base: current, label: s.branchOffFrom(current) });
    }
    if (status.defaultBranch && status.defaultBranch !== current) {
        branchTargets.push({ base: status.defaultBranch, label: s.branchOffFrom(status.defaultBranch) });
    }
    if (branchTargets.length === 0) {
        branchTargets.push({ base: undefined, label: s.newBranch });
    }
    const switchTarget = onSwitchBranch && current && status.defaultBranch && status.defaultBranch !== current ? status.defaultBranch : null;
    // Other worktrees to jump into — everything except the one we're already in
    // (matched by its checked-out branch) and the bare/main placeholder entry.
    const otherWorktrees = onOpenWorktree
        ? worktrees.filter(w => w.path && !w.detached && w.branch && w.branch !== current)
        : [];
    const hasLineDelta = status.added > 0 || status.removed > 0;
    // Untracked files carry no line delta vs HEAD, so surface them as a count when
    // they're the only change (otherwise +/- tells the story).
    const untrackedOnly = !hasLineDelta && status.untracked > 0;
    return (_jsxs(_Fragment, { children: [_jsxs(StatusRow
            // The base "where am I working" strip is part of the composer surface
            // itself, so it inherits the composer's width and clipped top radius.
            , { 
                // The base "where am I working" strip is part of the composer surface
                // itself, so it inherits the composer's width and clipped top radius.
                className: "coding-status-bar min-h-7 rounded-t-[inherit] rounded-b-none border-b border-(--ui-stroke-tertiary) px-3.5 py-1.5 hover:bg-transparent", 
                // Static branch glyph — never the loading spinner. This row only renders
                // once `status` exists, so a spinner here only ever fired on *refreshes*
                // of an already-loaded repo (window focus, turn settle), reading as an
                // annoying icon "blip" with no first-load value. Refreshes are silent.
                leading: _jsx(Codicon, { className: "text-(--ui-green)", name: "git-branch", size: "0.8rem" }), onActivate: onOpen, children: [_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1", children: [_jsx("span", { className: "min-w-0 truncate text-xs font-normal text-muted-foreground/92 transition-colors group-hover/status-row:text-foreground/90", title: branchLabel, children: branchLabel }), onBranchOff && (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": s.newBranch, className: "pointer-events-none size-4 shrink-0 text-muted-foreground/60 opacity-0 transition hover:text-foreground group-hover/status-row:pointer-events-auto group-hover/status-row:opacity-100 group-focus-within/status-row:pointer-events-auto group-focus-within/status-row:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100", onClick: event => event.stopPropagation(), onKeyDown: event => {
                                                // The row's onActivate also fires on Enter/Space; keep it from
                                                // opening the review pane when the kebab is the focus target.
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.stopPropagation();
                                                }
                                            }, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "kebab-vertical", size: "0.8rem" }) }) }), _jsxs(DropdownMenuContent, { align: "end", className: "w-60", side: "top", sideOffset: 6, children: [_jsx(DropdownMenuLabel, { className: MENU_SECTION, children: s.newBranch }), branchTargets.map(target => (_jsx(DropdownMenuItem, { onSelect: () => startBranch(target.base), children: _jsx("span", { className: "truncate", children: target.label }) }, target.base ?? '__head__'))), switchTarget && (_jsx(DropdownMenuItem, { onSelect: () => void switchToBranch(switchTarget), children: _jsx("span", { className: "truncate", children: s.switchTo(switchTarget) }) })), _jsx(DropdownMenuSeparator, {}), _jsx(DropdownMenuLabel, { className: MENU_SECTION, children: s.worktrees }), otherWorktrees.map(worktree => (_jsx(DropdownMenuItem, { onSelect: () => onOpenWorktree?.(worktree.path), children: _jsx("span", { className: "truncate", children: worktree.branch }) }, worktree.path))), _jsx(DropdownMenuItem, { onSelect: () => startBranch(undefined), children: _jsx("span", { className: "truncate", children: p.startWork }) }), onConvertBranch && (_jsx(DropdownMenuItem, { onSelect: () => startConvert(), children: _jsx("span", { className: "truncate", children: p.convertBranch }) }))] })] }))] }), (status.ahead > 0 || status.behind > 0) && (_jsxs("span", { className: "ml-auto flex shrink-0 items-center gap-1.5 text-[0.68rem] leading-4 text-muted-foreground/75 tabular-nums", children: [status.ahead > 0 && (_jsxs("span", { className: "flex items-center gap-0.5", title: s.ahead(status.ahead), children: [_jsx("span", { "aria-hidden": true, children: "\u2191" }), status.ahead] })), status.behind > 0 && (_jsxs("span", { className: "flex items-center gap-0.5", title: s.behind(status.behind), children: [_jsx("span", { "aria-hidden": true, children: "\u2193" }), status.behind] }))] })), hasLineDelta ? (_jsx(DiffCount, { added: status.added, className: `text-[0.72rem] leading-4 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`, removed: status.removed })) : untrackedOnly ? (_jsx("span", { className: `shrink-0 text-[0.72rem] leading-4 text-amber-500/90 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`, children: s.changed(status.untracked) })) : null] }), _jsx(Dialog, { onOpenChange: open => !branchPending && setBranchOpen(open), open: branchOpen, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: convertMode ? p.convertBranchTitle : p.newWorktreeTitle }), _jsxs(DialogDescription, { children: [convertMode ? p.convertBranchDesc : p.newWorktreeDesc, !convertMode && branchBase && (_jsx("span", { className: "mt-1 block text-(--ui-text-secondary)", children: s.branchOffFrom(branchBase) }))] })] }), convertMode ? (_jsxs(Command, { className: "rounded-md border border-(--ui-stroke-tertiary)", 
                            // The branch name is the authoritative key; filter on it directly.
                            filter: (value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0), children: [_jsx(CommandInput, { autoFocus: true, disabled: branchPending, placeholder: p.convertBranchPlaceholder }), _jsxs(CommandList, { className: "max-h-64", children: [_jsx(CommandEmpty, { children: branchesLoading ? p.branchesLoading : p.noBranches }), _jsx(CommandGroup, { children: branches.map(branch => (_jsxs(CommandItem, { disabled: branchPending, onSelect: () => void convertBranch(branch), value: branch.name, children: [_jsx(Codicon, { className: "shrink-0 text-(--ui-text-tertiary)", name: "git-branch", size: "0.8rem" }), _jsx("span", { className: "truncate", children: branch.name }), _jsx("span", { className: "ml-auto shrink-0 text-[0.625rem] text-(--ui-text-tertiary)", children: branchActionLabel(branch, p) })] }, branch.name))) })] })] })) : (_jsx(SanitizedInput, { autoFocus: true, disabled: branchPending, onKeyDown: event => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void submitBranch();
                                }
                                else if (event.key === 'Escape') {
                                    setBranchOpen(false);
                                }
                            }, onValueChange: setBranchName, placeholder: p.branchPlaceholder, sanitize: gitRef, value: branchName })), convertMode ? (_jsx(DialogFooter, { className: "sm:justify-start", children: _jsx(Button, { className: "px-0 text-(--ui-text-secondary) hover:text-foreground", disabled: branchPending, onClick: () => setConvertMode(false), type: "button", variant: "link", children: t.common.cancel }) })) : (_jsxs(DialogFooter, { className: "sm:justify-between", children: [onConvertBranch ? (_jsx(Button, { className: "px-0 text-(--ui-text-secondary) hover:text-foreground", disabled: branchPending, onClick: enterConvert, type: "button", variant: "link", children: p.convertBranchInstead })) : (_jsx("span", {})), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { disabled: branchPending, onClick: () => setBranchOpen(false), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: branchPending || !branchName.trim(), onClick: () => void submitBranch(), type: "button", children: p.startWork })] })] }))] }) })] }));
});
