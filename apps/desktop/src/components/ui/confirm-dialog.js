import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ActionStatus } from '@/components/ui/action-status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { AlertTriangle } from '@/lib/icons';
// Shared confirmation dialog: Enter confirms (from anywhere in the dialog),
// Esc/Cancel/backdrop dismiss. Owns the pending → done → close beat and inline
// error, so callers pass only an async onConfirm that does the work.
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel, busyLabel, doneLabel, cancelLabel, destructive = false, dismissOnConfirm = false }) {
    const { t } = useI18n();
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const busy = status === 'saving' || status === 'done';
    const resolvedConfirmLabel = confirmLabel ?? t.common.confirm;
    const resolvedBusyLabel = busyLabel ?? t.common.loading;
    const resolvedDoneLabel = doneLabel ?? t.common.done;
    const resolvedCancelLabel = cancelLabel ?? t.common.cancel;
    useEffect(() => {
        if (open) {
            setStatus('idle');
            setError(null);
        }
    }, [open]);
    async function run() {
        if (busy) {
            return;
        }
        setError(null);
        if (dismissOnConfirm) {
            try {
                await onConfirm();
                onClose();
            }
            catch (err) {
                setError(err instanceof Error ? err.message : t.errors.genericFailure);
            }
            return;
        }
        setStatus('saving');
        try {
            await onConfirm();
            setStatus('done');
            window.setTimeout(onClose, 600);
        }
        catch (err) {
            setStatus('idle');
            setError(err instanceof Error ? err.message : t.errors.genericFailure);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !busy && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-md", onKeyDown: event => {
                // Enter/Space confirm regardless of which button holds focus
                // (preventDefault stops a focused Cancel from swallowing it).
                if ((event.key === 'Enter' || event.key === ' ') && !busy) {
                    event.preventDefault();
                    void run();
                }
            }, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: title }), description ? _jsx(DialogDescription, { children: description }) : null] }), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: busy, onClick: onClose, type: "button", variant: "ghost", children: resolvedCancelLabel }), _jsx(Button, { disabled: busy, onClick: () => void run(), variant: destructive ? 'destructive' : 'default', children: _jsx(ActionStatus, { busy: resolvedBusyLabel, done: resolvedDoneLabel, idle: resolvedConfirmLabel, state: status }) })] })] }) }));
}
