'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { AlertCircle, ChevronDown, Loader2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { $gateway } from '@/store/gateway';
import { notifyError } from '@/store/notifications';
import { $approvalInlineVisible, $approvalRequest, clearApprovalRequest, registerApprovalInlineAnchor } from '@/store/prompts';
// Inline approval control. Rendered as a compact button strip
// under the pending tool row that raised the approval (the row already shows
// the command, so the strip deliberately doesn't repeat it) instead of as a
// modal overlay.
//
// Binding is POSITIONAL, not command-matched: the desktop `tool.start` payload
// carries no structured args (only tool_id/name/context — see
// tui_gateway/server.py::_on_tool_start), so we cannot join the approval to the
// row by command string. But `approval.request` only ever fires from the
// `terminal` / `execute_code` guards and the agent thread blocks on exactly one
// approval at a time, so the single pending row of those tools IS the row that
// raised it. The command/description text comes from `$approvalRequest` (the
// event payload), which is the only place that data reliably exists.
export const APPROVAL_TOOLS = new Set(['terminal', 'execute_code']);
export const PendingToolApproval = ({ part }) => {
    const request = useStore($approvalRequest);
    if (!request || !APPROVAL_TOOLS.has(part.toolName)) {
        return null;
    }
    return _jsx(InlineApprovalBar, { request: request });
};
const InlineApprovalBar = ({ request }) => {
    useEffect(() => registerApprovalInlineAnchor(), []);
    return _jsx(ApprovalBar, { request: request, surface: "inline" });
};
export const PendingApprovalFallback = () => {
    const { t } = useI18n();
    const request = useStore($approvalRequest);
    const inlineVisible = useStore($approvalInlineVisible);
    if (!request || inlineVisible) {
        return null;
    }
    return (_jsx("div", { className: "pointer-events-none absolute left-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2", "data-slot": "tool-approval-fallback", style: { bottom: 'calc(var(--composer-measured-height) + var(--status-stack-measured-height) + 0.875rem)' }, children: _jsxs("div", { className: "pointer-events-auto rounded-xl border border-primary/30 bg-(--ui-chat-surface-background) px-3 py-2 shadow-lg backdrop-blur-xl [-webkit-backdrop-filter:blur(1rem)]", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2 text-sm text-primary", children: [_jsx(AlertCircle, { className: "size-4 shrink-0" }), _jsx("span", { className: "shrink-0 font-medium", children: t.assistant.approval.jumpToApproval }), request.description && (_jsx("span", { className: "min-w-0 truncate text-(--ui-text-tertiary)", children: request.description }))] }), _jsx(ApprovalBar, { request: request, surface: "floating" })] }) }));
};
const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const ApprovalBar = ({ request, surface }) => {
    const { t } = useI18n();
    const copy = t.assistant.approval;
    const gateway = useStore($gateway);
    const [submitting, setSubmitting] = useState(null);
    // "Always allow" persists the pattern to ~/.hermes/config.yaml permanently, so
    // it goes through a confirm step rather than firing straight from the menu.
    const [confirmAlways, setConfirmAlways] = useState(false);
    // The pending tool row only shows a single truncated line of the command, and
    // a pending row can't be expanded (no result yet), so the full command was
    // previously only reachable via the "Always allow" modal. Let the user reveal
    // it inline instead — "expand, Run" (2 clicks) rather than the modal dance.
    const [showCommand, setShowCommand] = useState(false);
    const busy = submitting !== null;
    // false when the backend won't honor a permanent allow (tirith warning) → hide "Always allow".
    const allowPermanent = request.allowPermanent !== false;
    const hasCommand = request.command.trim().length > 0;
    const respond = useCallback(async (choice) => {
        // Another bar (or the keyboard path) may have already resolved this
        // approval; the atom is the single source of truth, so bail if it's gone.
        if (busy || !$approvalRequest.get()) {
            return;
        }
        if (!gateway) {
            notifyError(new Error(copy.gatewayDisconnected), copy.sendFailed);
            return;
        }
        setSubmitting(choice);
        try {
            await gateway.request('approval.respond', {
                choice,
                session_id: request.sessionId ?? undefined
            });
            triggerHaptic(choice === 'deny' ? 'cancel' : 'submit');
            clearApprovalRequest(request.sessionId);
        }
        catch (error) {
            notifyError(error, copy.sendFailed);
            setSubmitting(null);
        }
    }, [busy, copy.gatewayDisconnected, copy.sendFailed, gateway, request.sessionId]);
    // ⌘/Ctrl+Enter → Run, Esc → Reject.
    // While the confirm dialog is open it owns the keyboard (Esc closes it), so
    // the strip-level shortcuts stand down to avoid denying the whole approval.
    useEffect(() => {
        if (confirmAlways) {
            return;
        }
        const onKeyDown = (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void respond('once');
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                void respond('deny');
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [confirmAlways, respond]);
    return (_jsxs("div", { className: cn(surface === 'inline' ? 'mt-1 ps-5' : 'mt-2'), "data-slot": surface === 'inline' ? 'tool-approval-inline' : 'tool-approval-actions', children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("div", { className: "inline-flex h-6 items-stretch overflow-hidden rounded-md border border-primary/25 bg-primary/10 text-primary", children: [_jsxs(Button, { className: "h-full gap-1 rounded-none px-2 text-xs font-medium text-primary hover:bg-primary/15 hover:text-primary", disabled: busy, onClick: () => void respond('once'), size: "xs", variant: "ghost", children: [submitting === 'once' ? _jsx(Loader2, { className: "size-3 animate-spin" }) : copy.run, submitting !== 'once' && _jsx("span", { className: "text-[0.625rem] text-primary/60", children: isMac ? '⌘⏎' : 'Ctrl⏎' })] }), _jsx("span", { "aria-hidden": true, className: "w-px self-stretch bg-primary/20" }), _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": copy.moreOptions, className: "h-full w-5 rounded-none px-0 text-primary hover:bg-primary/15 hover:text-primary", disabled: busy, size: "xs", variant: "ghost", children: _jsx(ChevronDown, { className: "size-3" }) }) }), _jsxs(DropdownMenuContent, { align: "start", className: "min-w-44", children: [_jsx(DropdownMenuItem, { onSelect: () => void respond('session'), children: copy.allowSession }), allowPermanent && (_jsx(DropdownMenuItem, { onSelect: () => {
                                                    // Defer one tick so the menu fully unmounts before the dialog
                                                    // mounts — otherwise Radix's focus-return races the dialog and
                                                    // dismisses it via onInteractOutside.
                                                    setTimeout(() => setConfirmAlways(true), 0);
                                                }, children: copy.alwaysAllowMenu })), _jsx(DropdownMenuItem, { onSelect: () => void respond('deny'), variant: "destructive", children: copy.reject })] })] })] }), _jsxs(Button, { className: "h-6 gap-1.5 rounded-md px-1.5 text-xs font-normal text-(--ui-text-tertiary) hover:text-foreground", disabled: busy, onClick: () => void respond('deny'), size: "xs", variant: "ghost", children: [submitting === 'deny' ? _jsx(Loader2, { className: "size-3 animate-spin" }) : copy.reject, submitting !== 'deny' && _jsx("span", { className: "text-[0.625rem] opacity-55", children: "Esc" })] }), hasCommand && (_jsxs(Button, { "aria-expanded": showCommand, className: "h-6 gap-1 rounded-md px-1.5 text-xs font-normal text-(--ui-text-tertiary) hover:text-foreground", onClick: () => setShowCommand(value => !value), size: "xs", variant: "ghost", children: [copy.command, _jsx(ChevronDown, { className: cn('size-3 transition-transform', showCommand && 'rotate-180') })] }))] }), showCommand && hasCommand && (_jsx("pre", { className: "mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-2.5 py-1.5 font-mono text-xs leading-snug text-foreground", children: request.command.trim() })), _jsx(Dialog, { onOpenChange: setConfirmAlways, open: confirmAlways, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: copy.alwaysTitle }), _jsx(DialogDescription, { children: copy.alwaysDescription(request.description) })] }), request.command.trim() && (_jsx("pre", { className: "max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background) px-2.5 py-1.5 font-mono text-xs leading-snug text-foreground", children: request.command.trim() })), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: () => setConfirmAlways(false), size: "sm", variant: "ghost", children: t.common.cancel }), _jsx(Button, { onClick: () => {
                                        setConfirmAlways(false);
                                        void respond('always');
                                    }, size: "sm", variant: "destructive", children: copy.alwaysAllow })] })] }) })] }));
};
