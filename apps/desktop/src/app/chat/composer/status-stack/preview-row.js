import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { memo, useState } from 'react';
import { StatusRow } from '@/components/chat/status-row';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview';
import { cn } from '@/lib/utils';
import { PREVIEW_PANE_ID } from '@/store/layout';
import { notifyError } from '@/store/notifications';
import { $paneOpen } from '@/store/panes';
import { $previewTarget, dismissPreviewTarget, setCurrentSessionPreviewTarget } from '@/store/preview';
/** One detected artifact, single line, always visible: filename + open + close. */
export const PreviewStatusRow = memo(function PreviewStatusRow({ item, onDismiss }) {
    const { t } = useI18n();
    const activePreview = useStore($previewTarget);
    const previewPaneOpen = useStore($paneOpen(PREVIEW_PANE_ID));
    const [opening, setOpening] = useState(false);
    const isOpen = activePreview?.source === item.target && previewPaneOpen;
    const resolveTarget = async () => {
        const target = await normalizeOrLocalPreviewTarget(item.target, item.cwd || undefined);
        if (!target) {
            throw new Error(`Could not open preview target: ${item.target}`);
        }
        return target;
    };
    const togglePreview = async () => {
        if (opening) {
            return;
        }
        if (isOpen) {
            dismissPreviewTarget();
            return;
        }
        setOpening(true);
        try {
            setCurrentSessionPreviewTarget(await resolveTarget(), 'tool-result', item.target);
        }
        catch (error) {
            notifyError(error, t.preview.unavailable);
        }
        finally {
            setOpening(false);
        }
    };
    const openInBrowser = async () => {
        try {
            const bridge = window.hermesDesktop?.openPreviewInBrowser;
            if (!bridge) {
                throw new Error('Desktop preview browser bridge is unavailable');
            }
            await bridge((await resolveTarget()).url);
        }
        catch (error) {
            notifyError(error, t.preview.unavailable);
        }
    };
    return (_jsx(StatusRow, { leading: _jsx(Codicon, { "aria-hidden": true, className: cn('text-muted-foreground/70', opening && 'animate-pulse'), name: "globe", size: "0.8rem" }), 
        // Plain click opens the link in the browser; ⌘/Ctrl-click opens it in the
        // in-app preview pane instead. (isOpen still toggles the pane closed.)
        onActivate: event => {
            if (event.metaKey || event.ctrlKey) {
                void togglePreview();
            }
            else {
                void openInBrowser();
            }
        }, trailing: _jsx(Tip, { label: t.statusStack.dismiss, children: _jsx(Button, { "aria-label": t.statusStack.dismiss, className: "-my-1 size-4 rounded-md text-muted-foreground/60 hover:text-foreground/90", onClick: event => {
                    event.stopPropagation();
                    onDismiss(item.id);
                }, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.75rem" }) }) }), trailingVisible: true, children: _jsx(Tip, { label: _jsxs("span", { className: "flex flex-col gap-0.5", children: [_jsx("span", { children: item.target }), _jsx("span", { className: "opacity-70", children: t.preview.linkHint })] }), children: _jsx("span", { className: "min-w-0 max-w-[18rem] truncate text-[0.73rem] leading-4 text-foreground/92", children: item.label }) }) }));
});
