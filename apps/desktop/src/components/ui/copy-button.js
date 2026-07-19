import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Check, Copy, X } from '@/lib/icons';
import { cn } from '@/lib/utils';
const COPIED_RESET_MS = 1_500;
export async function writeClipboardText(text) {
    if (!text) {
        return;
    }
    if (window.hermesDesktop?.writeClipboard) {
        await window.hermesDesktop.writeClipboard(text);
        return;
    }
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    throw new Error('Clipboard API is unavailable');
}
export function CopyButton({ appearance = 'button', buttonSize, buttonVariant = 'ghost', children, className, disabled = false, errorMessage, haptic = true, iconClassName, label, onCopied, onCopyError, preventDefault = false, showLabel, side, stopPropagation = false, text, title }) {
    const { t } = useI18n();
    const resolvedErrorMessage = errorMessage ?? t.common.copyFailed;
    const resolvedLabel = label ?? t.common.copy;
    const [status, setStatus] = React.useState('idle');
    const resetRef = React.useRef(null);
    React.useEffect(() => {
        return () => {
            if (resetRef.current !== null) {
                window.clearTimeout(resetRef.current);
            }
        };
    }, []);
    const copy = React.useCallback(async (event) => {
        if (preventDefault) {
            event?.preventDefault();
        }
        if (stopPropagation) {
            event?.stopPropagation();
        }
        try {
            const value = typeof text === 'function' ? await text() : text;
            if (!value) {
                return;
            }
            await writeClipboardText(value);
            if (haptic) {
                triggerHaptic('selection');
            }
            if (resetRef.current !== null) {
                window.clearTimeout(resetRef.current);
            }
            setStatus('copied');
            resetRef.current = window.setTimeout(() => {
                setStatus('idle');
                resetRef.current = null;
            }, COPIED_RESET_MS);
            onCopied?.();
        }
        catch (error) {
            onCopyError?.(error);
            if (resetRef.current !== null) {
                window.clearTimeout(resetRef.current);
            }
            setStatus('error');
            resetRef.current = window.setTimeout(() => {
                setStatus('idle');
                resetRef.current = null;
            }, COPIED_RESET_MS);
        }
    }, [haptic, onCopied, onCopyError, preventDefault, stopPropagation, text]);
    const Icon = status === 'copied' ? Check : status === 'error' ? X : Copy;
    const icon = _jsx(Icon, { className: cn('size-3.5', iconClassName) });
    const visibleChildren = (showLabel ?? (appearance !== 'icon' && appearance !== 'tool-row'))
        ? status === 'copied'
            ? t.common.copied
            : status === 'error'
                ? t.common.failed
                : (children ?? resolvedLabel)
        : null;
    const content = (_jsxs(_Fragment, { children: [icon, visibleChildren] }));
    const feedbackLabel = status === 'copied' ? t.common.copied : status === 'error' ? resolvedErrorMessage : (title ?? resolvedLabel);
    const ariaLabel = status === 'idle' ? resolvedLabel : feedbackLabel;
    if (appearance === 'menu-item' || appearance === 'context-menu-item') {
        const MenuItem = appearance === 'menu-item' ? DropdownMenuItem : ContextMenuItem;
        return (_jsx(MenuItem, { className: className, disabled: disabled, onSelect: event => {
                event.preventDefault();
                void copy(event);
            }, children: content }));
    }
    if (appearance === 'inline') {
        return (_jsx(Tip, { label: feedbackLabel, side: side, children: _jsx("button", { "aria-label": ariaLabel, className: cn('inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.75rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40', className), disabled: disabled, onClick: event => void copy(event), type: "button", children: content }) }));
    }
    if (appearance === 'tool-row') {
        return (_jsx(Tip, { label: feedbackLabel, children: _jsx("button", { "aria-label": ariaLabel, className: cn('grid size-6 place-items-center rounded-md text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent/55 hover:text-foreground focus-visible:opacity-100 group-hover/tool-row:opacity-100 disabled:opacity-40', className), disabled: disabled, onClick: event => void copy(event), type: "button", children: icon }) }));
    }
    const button = (_jsx(Button, { "aria-label": ariaLabel, className: className, disabled: disabled, onClick: event => void copy(event), size: buttonSize ?? (appearance === 'icon' ? 'icon' : 'default'), type: "button", variant: buttonVariant, children: content }));
    // Only icon-only buttons need a tooltip; the text variant already shows its label.
    return appearance === 'icon' ? (_jsx(Tip, { label: feedbackLabel, side: side ?? 'bottom', children: button })) : (button);
}
