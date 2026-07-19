import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { renameSession } from '@/hermes';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { exportSession } from '@/lib/session-export';
import { activeGateway } from '@/store/gateway';
import { notify, notifyError } from '@/store/notifications';
import { $activeSessionId, $selectedStoredSessionId, setSessions } from '@/store/session';
import { canOpenSessionWindow, openSessionInNewWindow } from '@/store/windows';
// Rename a session, preferring the gateway's session.title RPC over REST.
//
// A freshly *branched* session (and any brand-new chat) lives only in the
// gateway's in-memory _sessions map keyed by its RUNTIME id — no row is
// persisted to state.db until the first turn. REST PATCH /api/sessions/{id}
// resolves against the stored sessions table, so it 404s ("Session not found")
// on these runtime-only sessions. The session.title RPC resolves the live
// runtime session AND persists the row on demand, so it succeeds where REST
// cannot. This mirrors the /title slash command's fix (use-prompt-actions.ts).
//
// We only take the RPC path for the ACTIVE/selected session: its runtime id is
// known ($activeSessionId) and it lives on the active gateway, so there is no
// profile-routing ambiguity. Every other row (already persisted, possibly on a
// background profile) keeps the REST path, which handles profile scoping and a
// non-empty title is required by the RPC (it rejects clears), so clears stay on
// REST too.
export async function renameSessionPreferringRpc(storedSessionId, title, profile) {
    const isActiveRow = storedSessionId === $selectedStoredSessionId.get();
    const runtimeId = isActiveRow ? $activeSessionId.get() : null;
    const gateway = activeGateway();
    if (title && runtimeId && gateway) {
        try {
            const result = await gateway.request('session.title', {
                session_id: runtimeId,
                title
            });
            return { title: result?.title ?? title };
        }
        catch (err) {
            // Fall through to REST — e.g. the socket is mid-reconnect. REST still
            // works for any session that already has a persisted row. Log so a
            // genuine RPC-side failure (which then surfaces a REST 404 for the
            // runtime id) is at least diagnosable instead of silently swallowed.
            console.warn('session.title RPC rename failed; falling back to REST', err);
        }
    }
    return renameSession(storedSessionId, title, profile);
}
function useSessionActions({ sessionId, title, pinned = false, profile, onPin, onBranch, onArchive, onDelete }) {
    const { t } = useI18n();
    const r = t.sidebar.row;
    const [renameOpen, setRenameOpen] = useState(false);
    const pinItem = {
        disabled: !onPin,
        icon: 'pin',
        label: pinned ? r.unpin : r.pin,
        onSelect: () => {
            triggerHaptic('selection');
            onPin?.();
        }
    };
    const items = [
        ...(canOpenSessionWindow()
            ? [
                {
                    disabled: !sessionId,
                    icon: 'link-external',
                    label: r.newWindow,
                    onSelect: () => {
                        triggerHaptic('selection');
                        void openSessionInNewWindow(sessionId);
                    }
                }
            ]
            : []),
        {
            disabled: !sessionId,
            icon: 'cloud-download',
            label: r.export,
            onSelect: () => {
                triggerHaptic('selection');
                void exportSession(sessionId, { profile, title });
            }
        },
        {
            disabled: !onBranch,
            icon: 'git-branch',
            label: r.branchFrom,
            onSelect: () => {
                triggerHaptic('selection');
                onBranch?.();
            }
        },
        {
            disabled: !sessionId,
            icon: 'edit',
            label: r.rename,
            onSelect: () => {
                triggerHaptic('selection');
                setRenameOpen(true);
            }
        },
        {
            disabled: !onArchive,
            icon: 'archive',
            label: r.archive,
            onSelect: () => {
                triggerHaptic('selection');
                onArchive?.();
            }
        },
        {
            className: 'text-destructive focus:text-destructive',
            disabled: !onDelete,
            icon: 'trash',
            label: t.common.delete,
            onSelect: () => {
                triggerHaptic('warning');
                onDelete?.();
            },
            variant: 'destructive'
        }
    ];
    const renderMenuItem = (Item, { className, disabled, icon, label, onSelect, variant }) => (_jsxs(Item, { className: className, disabled: disabled, onSelect: onSelect, variant: variant, children: [_jsx(Codicon, { name: icon, size: "0.875rem" }), _jsx("span", { children: label })] }, label));
    const renderItems = (Item) => (_jsxs(_Fragment, { children: [renderMenuItem(Item, pinItem), _jsx(CopyButton, { appearance: Item === DropdownMenuItem ? 'menu-item' : 'context-menu-item', disabled: !sessionId, errorMessage: r.copyIdFailed, iconClassName: "size-3.5 text-current", label: r.copyId, onCopyError: err => notifyError(err, r.copyIdFailed), text: sessionId }, r.copyId), items.map(spec => renderMenuItem(Item, spec))] }));
    const renameDialog = (_jsx(RenameSessionDialog, { currentTitle: title, onOpenChange: setRenameOpen, open: renameOpen, profile: profile, sessionId: sessionId }));
    return { renameDialog, renderItems };
}
export function SessionActionsMenu({ children, align = 'end', sideOffset = 6, ...actions }) {
    const { t } = useI18n();
    const { renameDialog, renderItems } = useSessionActions(actions);
    return (_jsxs(_Fragment, { children: [_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: children }), _jsx(DropdownMenuContent, { align: align, "aria-label": t.sidebar.row.actionsFor(actions.title), className: "w-40", sideOffset: sideOffset, children: renderItems(DropdownMenuItem) })] }), renameDialog] }));
}
export function SessionContextMenu({ children, ...actions }) {
    const { t } = useI18n();
    const { renameDialog, renderItems } = useSessionActions(actions);
    return (_jsxs(_Fragment, { children: [_jsxs(ContextMenu, { children: [_jsx(ContextMenuTrigger, { asChild: true, children: children }), _jsx(ContextMenuContent, { "aria-label": t.sidebar.row.actionsFor(actions.title), className: "w-40", children: renderItems(ContextMenuItem) })] }), renameDialog] }));
}
function RenameSessionDialog({ open, onOpenChange, sessionId, currentTitle, profile }) {
    const { t } = useI18n();
    const r = t.sidebar.row;
    const [value, setValue] = useState(currentTitle);
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef(null);
    useEffect(() => {
        if (open) {
            setValue(currentTitle);
            window.setTimeout(() => inputRef.current?.select(), 0);
        }
    }, [currentTitle, open]);
    const submit = async () => {
        const next = value.trim();
        if (!sessionId || submitting) {
            return;
        }
        if (next === currentTitle.trim()) {
            onOpenChange(false);
            return;
        }
        setSubmitting(true);
        try {
            const result = await renameSessionPreferringRpc(sessionId, next, profile);
            const finalTitle = result.title || next || '';
            setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: finalTitle || null } : s)));
            notify({ durationMs: 2_000, kind: 'success', message: r.renamed });
            onOpenChange(false);
        }
        catch (err) {
            notifyError(err, r.renameFailed);
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: r.renameTitle }), _jsx(DialogDescription, { children: r.renameDesc })] }), _jsx(Input, { autoFocus: true, disabled: submitting, onChange: event => setValue(event.target.value), onKeyDown: event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                        }
                        else if (event.key === 'Escape') {
                            onOpenChange(false);
                        }
                    }, placeholder: r.untitledPlaceholder, ref: inputRef, value: value }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: submitting, onClick: () => onOpenChange(false), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: submitting, onClick: () => void submit(), type: "button", children: t.common.save })] })] }) }));
}
