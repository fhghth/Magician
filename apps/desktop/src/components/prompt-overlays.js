'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import { PendingApprovalFallback } from '@/components/assistant-ui/tool/approval';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { KeyRound, Loader2, Lock } from '@/lib/icons';
import { $gateway } from '@/store/gateway';
import { notifyError } from '@/store/notifications';
import { $secretRequest, $sudoRequest, clearSecretRequest, clearSudoRequest } from '@/store/prompts';
// Renders the modal mid-turn prompts the gateway raises and waits on: sudo
// password and skill secret capture. Dangerous-command / execute_code approval
// prefers the pending tool row, but also has a chat-level fallback when no row
// is mounted (remote gateway sessions can raise the request before the matching
// tool call is visible). Each Python-side caller blocks the agent thread until
// the matching `*.respond` RPC lands; without a renderer the agent stalls until
// its timeout and the tool is BLOCKED. Any close path (Esc, backdrop
// click) funnels through Radix's single `onOpenChange(false)` and maps to a
// refusal, so silence is never mistaken for consent, matching the TUI. We
// deliberately do NOT add onEscapeKeyDown / onInteractOutside handlers — they'd
// fire a second `*.respond` alongside onOpenChange (double-send) or block the
// backdrop-dismiss path.
function SudoDialog() {
    const { t } = useI18n();
    const copy = t.prompts;
    const request = useStore($sudoRequest);
    const gateway = useStore($gateway);
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    useEffect(() => {
        setPassword('');
        setSubmitting(false);
    }, [request?.requestId]);
    const send = useCallback(async (value) => {
        if (!request) {
            return;
        }
        if (!gateway) {
            notifyError(new Error(copy.gatewayDisconnected), copy.sudoSendFailed);
            return;
        }
        setSubmitting(true);
        try {
            await gateway.request('sudo.respond', {
                password: value,
                request_id: request.requestId
            });
            triggerHaptic('submit');
            clearSudoRequest(request.sessionId, request.requestId);
        }
        catch (error) {
            notifyError(error, copy.sudoSendFailed);
            setSubmitting(false);
        }
    }, [copy.gatewayDisconnected, copy.sudoSendFailed, gateway, request]);
    // Cancel → empty password. The backend treats an empty sudo response as a
    // failed sudo (no command runs), so closing the dialog is a safe refusal.
    const onOpenChange = useCallback((open) => {
        if (!open && !submitting && request) {
            void send('');
        }
    }, [request, send, submitting]);
    const onSubmit = useCallback((event) => {
        event.preventDefault();
        void send(password);
    }, [password, send]);
    if (!request) {
        return null;
    }
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: true, children: _jsxs(DialogContent, { showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { icon: Lock, children: copy.sudoTitle }), _jsx(DialogDescription, { children: copy.sudoDesc })] }), _jsxs("form", { className: "grid gap-3", onSubmit: onSubmit, children: [_jsx(Input, { autoFocus: true, disabled: submitting, onChange: event => setPassword(event.target.value), placeholder: copy.sudoPlaceholder, type: "password", value: password }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: submitting, onClick: () => void send(''), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: submitting, type: "submit", children: submitting ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : t.common.send })] })] })] }) }));
}
function SecretDialog() {
    const { t } = useI18n();
    const copy = t.prompts;
    const request = useStore($secretRequest);
    const gateway = useStore($gateway);
    const [value, setValue] = useState('');
    const [submitting, setSubmitting] = useState(false);
    useEffect(() => {
        setValue('');
        setSubmitting(false);
    }, [request?.requestId]);
    const send = useCallback(async (secret) => {
        if (!request) {
            return;
        }
        if (!gateway) {
            notifyError(new Error(copy.gatewayDisconnected), copy.secretSendFailed);
            return;
        }
        setSubmitting(true);
        try {
            await gateway.request('secret.respond', {
                request_id: request.requestId,
                value: secret
            });
            triggerHaptic('submit');
            clearSecretRequest(request.sessionId, request.requestId);
        }
        catch (error) {
            notifyError(error, copy.secretSendFailed);
            setSubmitting(false);
        }
    }, [copy.gatewayDisconnected, copy.secretSendFailed, gateway, request]);
    const onOpenChange = useCallback((open) => {
        if (!open && !submitting && request) {
            void send('');
        }
    }, [request, send, submitting]);
    const onSubmit = useCallback((event) => {
        event.preventDefault();
        void send(value);
    }, [send, value]);
    if (!request) {
        return null;
    }
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: true, children: _jsxs(DialogContent, { showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { icon: KeyRound, children: request.envVar || copy.secretTitle }), _jsx(DialogDescription, { children: request.prompt || copy.secretDesc })] }), _jsxs("form", { className: "grid gap-3", onSubmit: onSubmit, children: [_jsx(Input, { autoFocus: true, disabled: submitting, onChange: event => setValue(event.target.value), placeholder: request.envVar || copy.secretPlaceholder, type: "password", value: value }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: submitting, onClick: () => void send(''), type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: submitting || !value, type: "submit", children: submitting ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : t.common.send })] })] })] }) }));
}
export function PromptOverlays() {
    return (_jsxs(_Fragment, { children: [_jsx(PendingApprovalFallback, {}), _jsx(SudoDialog, {}), _jsx(SecretDialog, {})] }));
}
