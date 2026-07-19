import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { AssistantMessage } from '@/components/assistant-ui/thread/assistant-message';
import { ThreadMessageList } from '@/components/assistant-ui/thread/list';
import { BackgroundResumeNotice, CenteredThreadSpinner, ResponseLoadingIndicator } from '@/components/assistant-ui/thread/status';
import { SystemMessage } from '@/components/assistant-ui/thread/system-message';
import { ThreadTimeline } from '@/components/assistant-ui/thread/timeline';
import { UserEditComposer } from '@/components/assistant-ui/thread/user-edit-composer';
import { UserMessage } from '@/components/assistant-ui/thread/user-message';
import { Intro } from '@/components/chat/intro';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/i18n';
import { notifyError } from '@/store/notifications';
export const Thread = ({ clampToComposer = false, cwd = null, gateway = null, intro, loading, onBranchInNewChat, onCancel, onDismissError, onRestoreToMessage, sessionId = null, sessionKey }) => {
    const { t } = useI18n();
    const copy = t.assistant.thread;
    const [restoreConfirmTarget, setRestoreConfirmTarget] = useState(null);
    const closeRestoreConfirm = useCallback(() => setRestoreConfirmTarget(null), []);
    const confirmRestore = useCallback(() => {
        if (!restoreConfirmTarget || !onRestoreToMessage) {
            throw new Error('Restore is unavailable for this message.');
        }
        const { messageId, text, userOrdinal } = restoreConfirmTarget;
        closeRestoreConfirm();
        void Promise.resolve(onRestoreToMessage(messageId, { text, userOrdinal })).catch((error) => {
            notifyError(error, 'Restore failed');
        });
    }, [closeRestoreConfirm, onRestoreToMessage, restoreConfirmTarget]);
    const requestRestoreConfirm = useCallback((messageId, target) => {
        setRestoreConfirmTarget({ messageId, ...target });
    }, []);
    const messageComponents = useMemo(() => ({
        AssistantMessage: () => (_jsx(AssistantMessage, { onBranchInNewChat: onBranchInNewChat, onDismissError: onDismissError })),
        SystemMessage,
        UserEditComposer: () => _jsx(UserEditComposer, { cwd: cwd, gateway: gateway, sessionId: sessionId }),
        UserMessage: () => (_jsx(UserMessage, { onCancel: onCancel, onRequestRestoreConfirm: onRestoreToMessage ? requestRestoreConfirm : undefined }))
    }), [cwd, gateway, onBranchInNewChat, onCancel, onDismissError, onRestoreToMessage, requestRestoreConfirm, sessionId]);
    const emptyPlaceholder = intro ? (_jsx("div", { className: "flex min-h-0 w-full flex-col items-center justify-center pt-[var(--composer-measured-height)]", children: _jsx(Intro, { ...intro }) })) : undefined;
    return (_jsxs("div", { className: "relative grid h-full min-h-0 max-w-full grid-rows-[minmax(0,1fr)] overflow-hidden bg-transparent contain-[layout_paint]", children: [_jsx(ThreadMessageList, { clampToComposer: clampToComposer, components: messageComponents, emptyPlaceholder: emptyPlaceholder, loadingIndicator: loading === 'response' ? _jsx(ResponseLoadingIndicator, {}) : _jsx(BackgroundResumeNotice, {}), sessionKey: sessionKey }), loading === 'session' && _jsx(CenteredThreadSpinner, {}), _jsx(ThreadTimeline, {}), _jsx(ConfirmDialog, { confirmLabel: copy.restoreConfirm, description: copy.restoreBody, destructive: true, onClose: closeRestoreConfirm, onConfirm: confirmRestore, open: Boolean(restoreConfirmTarget), title: copy.restoreTitle })] }));
};
