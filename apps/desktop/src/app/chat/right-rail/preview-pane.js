import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { isDesktopFsRemoteMode } from '@/lib/desktop-fs';
import { Bug } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { notify, notifyError } from '@/store/notifications';
import { $previewServerRestart, failPreviewServerRestart } from '@/store/preview';
import { clampConsoleHeight, compactUrl, formatLogLine, isNearConsoleBottom, PreviewConsolePanel, PreviewConsoleTitlebarIcon } from './preview-console';
import { createPreviewConsoleState } from './preview-console-state';
import { LocalFilePreview, PreviewEmptyState } from './preview-file';
const FILE_RELOAD_DEBOUNCE_MS = 200;
const SERVER_RESTART_TIMEOUT_MS = 45_000;
function loadErrorTitle(error, copy) {
    const description = error.description.toLowerCase();
    if (description.includes('module script') || description.includes('mime type')) {
        return copy.appFailedToBoot;
    }
    if (description.includes('connection') || description.includes('refused') || description.includes('not found')) {
        return copy.serverNotFound;
    }
    return copy.failedToLoad;
}
function isModuleMimeError(message) {
    const lower = message.toLowerCase();
    return lower.includes('failed to load module script') && lower.includes('mime type');
}
function PreviewLoadError({ consoleHeight = 0, error, onRestartServer, onRetry, restarting }) {
    const { t } = useI18n();
    const copy = t.preview.web;
    return (_jsx(PreviewEmptyState, { body: _jsxs(_Fragment, { children: [_jsxs("a", { className: "pointer-events-auto block font-mono text-muted-foreground/90 underline decoration-current/20 underline-offset-4 transition-colors hover:text-foreground", href: error.url, onClick: event => {
                        event.preventDefault();
                        void window.hermesDesktop?.openExternal(error.url);
                    }, children: [compactUrl(error.url), error.code ? ` (${error.code})` : ''] }), _jsx("div", { className: "mt-1 text-[0.6875rem] text-muted-foreground/70", children: error.description })] }), consoleHeight: consoleHeight, primaryAction: { label: copy.tryAgain, onClick: onRetry }, secondaryAction: onRestartServer
            ? {
                disabled: restarting,
                label: restarting ? copy.restarting : copy.askRestart,
                onClick: onRestartServer
            }
            : undefined, title: loadErrorTitle(error, copy) }));
}
const TITLEBAR_GROUP_ID = 'preview';
export function PreviewPane({ embedded = false, onRestartServer, reloadRequest = 0, setTitlebarToolGroup, target }) {
    const { t } = useI18n();
    const copy = t.preview.web;
    const [consoleState] = useState(() => createPreviewConsoleState());
    const consoleBodyRef = useRef(null);
    const consoleShouldStickRef = useRef(true);
    const hostRef = useRef(null);
    const lastReloadRequestRef = useRef(reloadRequest);
    const lastRestartEventRef = useRef('');
    const previewContentRef = useRef(null);
    const webviewRef = useRef(null);
    const previewServerRestart = useStore($previewServerRestart);
    const consoleHeight = useStore(consoleState.$height);
    const consoleOpen = useStore(consoleState.$open);
    const [currentUrl, setCurrentUrl] = useState(target.url);
    const [devtoolsOpen, setDevtoolsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [localReloadKey, setLocalReloadKey] = useState(0);
    const isWebPreview = target.kind === 'url' || (target.previewKind === 'html' && target.renderMode !== 'source');
    const currentLabel = compactUrl(currentUrl);
    const previewLabel = target.label && target.label.replace(/\/$/, '') !== currentLabel.replace(/\/$/, '') ? target.label : currentLabel;
    const restartingServer = previewServerRestart?.status === 'running' &&
        (previewServerRestart.url === target.url || previewServerRestart.url === currentUrl);
    const startConsoleResize = useCallback((event) => {
        event.preventDefault();
        const handle = event.currentTarget;
        const pointerId = event.pointerId;
        const startY = event.clientY;
        const startHeight = consoleHeight;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        let active = true;
        handle.setPointerCapture?.(pointerId);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        const handleMove = (moveEvent) => {
            if (!active) {
                return;
            }
            consoleState.setHeight(clampConsoleHeight(startHeight + startY - moveEvent.clientY));
        };
        const cleanup = () => {
            if (!active) {
                return;
            }
            active = false;
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            handle.releasePointerCapture?.(pointerId);
            window.removeEventListener('pointermove', handleMove, true);
            window.removeEventListener('pointerup', cleanup, true);
            window.removeEventListener('pointercancel', cleanup, true);
            window.removeEventListener('blur', cleanup);
            handle.removeEventListener('lostpointercapture', cleanup);
        };
        window.addEventListener('pointermove', handleMove, true);
        window.addEventListener('pointerup', cleanup, true);
        window.addEventListener('pointercancel', cleanup, true);
        window.addEventListener('blur', cleanup);
        handle.addEventListener('lostpointercapture', cleanup);
    }, [consoleHeight, consoleState]);
    const reloadPreview = useCallback(() => {
        setLoadError(null);
        if (!isWebPreview) {
            setLocalReloadKey(key => key + 1);
            return;
        }
        if (webviewRef.current?.reloadIgnoringCache) {
            webviewRef.current.reloadIgnoringCache();
        }
        else {
            webviewRef.current?.reload?.();
        }
    }, [isWebPreview]);
    const appendConsoleEntry = useCallback((entry) => {
        consoleShouldStickRef.current = isNearConsoleBottom(consoleBodyRef.current);
        consoleState.append(entry);
    }, [consoleState]);
    const restartServer = useCallback(async () => {
        if (!onRestartServer) {
            return;
        }
        // Auto-open the preview console so the user can see progress events
        // streaming back from the background agent. Without this, clicking
        // "Ask Hermes to restart the server" looked like it did nothing —
        // the work was happening, but in a collapsed pane.
        consoleState.setOpen(true);
        try {
            const context = consoleState.$logs.get().slice(-12).map(formatLogLine).join('\n');
            const taskId = await onRestartServer(currentUrl, context || undefined);
            appendConsoleEntry({
                level: 1,
                message: copy.lookingRestart(taskId)
            });
            notify({
                kind: 'info',
                title: copy.restartingTitle,
                message: copy.restartingMessage,
                durationMs: 4000
            });
        }
        catch (error) {
            appendConsoleEntry({
                level: 2,
                message: copy.startRestartFailed(error instanceof Error ? error.message : String(error))
            });
            notifyError(error, copy.restartFailed);
        }
    }, [appendConsoleEntry, consoleState, copy, currentUrl, onRestartServer]);
    const toggleDevTools = useCallback(() => {
        const webview = webviewRef.current;
        if (!webview?.openDevTools) {
            return;
        }
        if (webview.isDevToolsOpened?.()) {
            webview.closeDevTools?.();
            setDevtoolsOpen(false);
            return;
        }
        webview.openDevTools();
        setDevtoolsOpen(true);
    }, []);
    useEffect(() => {
        if (!setTitlebarToolGroup) {
            return;
        }
        const tools = [
            ...(isWebPreview
                ? [
                    {
                        active: consoleOpen,
                        icon: _jsx(PreviewConsoleTitlebarIcon, { consoleState: consoleState }),
                        id: `${TITLEBAR_GROUP_ID}-console`,
                        label: consoleOpen ? copy.hideConsole : copy.showConsole,
                        onSelect: () => consoleState.setOpen(open => !open)
                    },
                    {
                        active: devtoolsOpen,
                        icon: _jsx(Bug, {}),
                        id: `${TITLEBAR_GROUP_ID}-devtools`,
                        label: devtoolsOpen ? copy.hideDevTools : copy.openDevTools,
                        onSelect: toggleDevTools
                    }
                ]
                : [])
        ];
        setTitlebarToolGroup(TITLEBAR_GROUP_ID, tools);
        return () => setTitlebarToolGroup(TITLEBAR_GROUP_ID, []);
    }, [consoleOpen, consoleState, copy, devtoolsOpen, isWebPreview, setTitlebarToolGroup, toggleDevTools]);
    useEffect(() => {
        if (!consoleOpen) {
            return;
        }
        consoleShouldStickRef.current = true;
        const handle = window.requestAnimationFrame(() => {
            const consoleBody = consoleBodyRef.current;
            consoleBody?.scrollTo({ top: consoleBody.scrollHeight });
        });
        return () => window.cancelAnimationFrame(handle);
    }, [consoleOpen]);
    useEffect(() => {
        if (!previewServerRestart ||
            !previewServerRestart.message ||
            (previewServerRestart.url !== target.url && previewServerRestart.url !== currentUrl)) {
            return;
        }
        const eventKey = `${previewServerRestart.taskId}:${previewServerRestart.status}:${previewServerRestart.message || ''}`;
        if (eventKey === lastRestartEventRef.current) {
            return;
        }
        lastRestartEventRef.current = eventKey;
        appendConsoleEntry({
            level: previewServerRestart.status === 'error' ? 2 : 1,
            message: previewServerRestart.status === 'running'
                ? previewServerRestart.message
                : previewServerRestart.status === 'complete'
                    ? copy.finishedRestarting(previewServerRestart.message)
                    : copy.failedRestarting(previewServerRestart.message || copy.unknownError)
        });
        if (previewServerRestart.status === 'complete') {
            reloadPreview();
            notify({
                kind: 'success',
                title: copy.restartedTitle,
                message: previewServerRestart.message?.slice(0, 160) || copy.reloadingNow,
                durationMs: 3500
            });
        }
        else if (previewServerRestart.status === 'error') {
            notify({
                kind: 'warning',
                title: copy.restartFailedTitle,
                message: previewServerRestart.message?.slice(0, 200) || copy.restartFailedMessage,
                durationMs: 6000
            });
        }
    }, [appendConsoleEntry, copy, currentUrl, previewServerRestart, reloadPreview, target.url]);
    useEffect(() => {
        if (!restartingServer || !previewServerRestart) {
            return;
        }
        const taskId = previewServerRestart.taskId;
        const timer = window.setTimeout(() => {
            failPreviewServerRestart(taskId, copy.stillWorking);
        }, SERVER_RESTART_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [copy.stillWorking, previewServerRestart, restartingServer]);
    useEffect(() => {
        if (reloadRequest === lastReloadRequestRef.current) {
            return;
        }
        lastReloadRequestRef.current = reloadRequest;
        if (target.kind !== 'url') {
            return;
        }
        appendConsoleEntry({
            level: 1,
            message: copy.workspaceReloading
        });
        reloadPreview();
    }, [appendConsoleEntry, copy.workspaceReloading, reloadPreview, reloadRequest, target.kind]);
    useEffect(() => {
        if (target.kind !== 'file' ||
            isDesktopFsRemoteMode() ||
            !window.hermesDesktop?.watchPreviewFile ||
            !window.hermesDesktop?.onPreviewFileChanged) {
            return;
        }
        let active = true;
        let pendingReloadCount = 0;
        let pendingReloadUrl = '';
        let reloadTimer = null;
        let watchId = '';
        const flushReload = () => {
            if (!active || pendingReloadCount === 0) {
                return;
            }
            const changedCount = pendingReloadCount;
            const changedUrl = pendingReloadUrl;
            pendingReloadCount = 0;
            pendingReloadUrl = '';
            appendConsoleEntry({
                level: 1,
                message: changedCount === 1
                    ? copy.fileChanged(compactUrl(changedUrl))
                    : copy.filesChanged(changedCount, compactUrl(changedUrl))
            });
            reloadPreview();
        };
        const unsubscribe = window.hermesDesktop.onPreviewFileChanged(payload => {
            if (!active || payload.id !== watchId) {
                return;
            }
            pendingReloadCount += 1;
            pendingReloadUrl = payload.url;
            if (reloadTimer) {
                clearTimeout(reloadTimer);
            }
            reloadTimer = setTimeout(() => {
                reloadTimer = null;
                flushReload();
            }, FILE_RELOAD_DEBOUNCE_MS);
        });
        void window.hermesDesktop
            .watchPreviewFile(target.url)
            .then(watch => {
            if (!active) {
                void window.hermesDesktop?.stopPreviewFileWatch?.(watch.id);
                return;
            }
            watchId = watch.id;
        })
            .catch(error => {
            appendConsoleEntry({
                level: 2,
                message: copy.watchFailed(error instanceof Error ? error.message : String(error))
            });
        });
        return () => {
            active = false;
            unsubscribe();
            if (reloadTimer) {
                clearTimeout(reloadTimer);
            }
            if (watchId) {
                void window.hermesDesktop?.stopPreviewFileWatch?.(watchId);
            }
        };
    }, [appendConsoleEntry, copy, reloadPreview, target.kind, target.url]);
    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        host.replaceChildren();
        webviewRef.current = null;
        setCurrentUrl(target.url);
        setDevtoolsOpen(false);
        setLoadError(null);
        consoleState.reset();
        setLoading(true);
        if (!isWebPreview) {
            setLoading(false);
            return;
        }
        const webview = document.createElement('webview');
        webview.className = 'flex h-full w-full flex-1 bg-transparent';
        webview.setAttribute('partition', 'persist:hermes-preview');
        webview.setAttribute('src', target.url);
        webview.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
        const onConsole = (event) => {
            const detail = event;
            const message = detail.message || '';
            appendConsoleEntry({
                level: detail.level ?? 0,
                line: detail.line,
                message,
                source: detail.sourceId
            });
            if ((detail.level ?? 0) >= 3 && isModuleMimeError(message)) {
                setLoadError({
                    description: copy.moduleMimeDescription,
                    url: webview.getURL?.() || target.url
                });
                setLoading(false);
            }
        };
        const onNavigate = (event) => {
            const detail = event;
            if (detail.url) {
                setLoadError(null);
                setCurrentUrl(detail.url);
            }
        };
        const onFail = (event) => {
            const detail = event;
            const errorCode = detail.errorCode;
            if (errorCode === -3) {
                return;
            }
            appendConsoleEntry({
                level: 3,
                message: copy.loadFailedConsole(errorCode, detail.errorDescription || detail.validatedURL || copy.unknownError)
            });
            setLoadError({
                code: errorCode,
                description: detail.errorDescription || copy.unreachableDescription,
                url: detail.validatedURL || webview.getURL?.() || target.url
            });
            setLoading(false);
        };
        const onStart = () => setLoading(true);
        const onStop = () => setLoading(false);
        webview.addEventListener('console-message', onConsole);
        webview.addEventListener('did-fail-load', onFail);
        webview.addEventListener('did-navigate', onNavigate);
        webview.addEventListener('did-navigate-in-page', onNavigate);
        webview.addEventListener('did-start-loading', onStart);
        webview.addEventListener('did-stop-loading', onStop);
        host.appendChild(webview);
        webviewRef.current = webview;
        return () => {
            webview.removeEventListener('console-message', onConsole);
            webview.removeEventListener('did-fail-load', onFail);
            webview.removeEventListener('did-navigate', onNavigate);
            webview.removeEventListener('did-navigate-in-page', onNavigate);
            webview.removeEventListener('did-start-loading', onStart);
            webview.removeEventListener('did-stop-loading', onStop);
            webview.remove();
        };
    }, [appendConsoleEntry, consoleState, copy, isWebPreview, target.url]);
    return (_jsx("aside", { className: "relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent text-muted-foreground", children: _jsxs("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [!embedded && (_jsx("div", { className: "pointer-events-none flex min-h-(--titlebar-height) items-center gap-1.5 border-b border-border/60 bg-background px-2 py-1", children: _jsx("div", { className: "min-w-0 flex-1", children: _jsx(Tip, { label: copy.openTarget(currentUrl), children: _jsx("a", { className: "pointer-events-auto inline max-w-full truncate text-left text-xs font-medium text-foreground underline-offset-4 decoration-current/20 transition-colors hover:text-primary hover:underline", href: currentUrl, rel: "noreferrer", target: "_blank", children: previewLabel || copy.fallbackTitle }) }) }) })), _jsxs("div", { className: "pointer-events-auto relative min-h-0 flex-1 overflow-hidden bg-transparent", ref: previewContentRef, children: [_jsx("div", { className: cn('absolute inset-0 flex bg-transparent', (!isWebPreview || loadError) && 'pointer-events-none opacity-0'), ref: hostRef }), !isWebPreview && _jsx(LocalFilePreview, { reloadKey: localReloadKey, target: target }), loadError && (_jsx(PreviewLoadError, { consoleHeight: consoleOpen ? consoleHeight : 0, error: loadError, onRestartServer: target.kind === 'url' && onRestartServer ? () => void restartServer() : undefined, onRetry: reloadPreview, restarting: restartingServer })), isWebPreview && consoleOpen && (_jsx(PreviewConsolePanel, { consoleBodyRef: consoleBodyRef, consoleShouldStickRef: consoleShouldStickRef, consoleState: consoleState, startConsoleResize: startConsoleResize }))] })] }) }));
}
