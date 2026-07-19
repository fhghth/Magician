'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Check, Copy, Maximize, RefreshCw, X, ZoomIn, ZoomOut } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { useZoomPan } from './use-zoom-pan';
/**
 * Generic click-to-expand viewer: renders inline content with a hover "expand"
 * affordance, then opens a full overlay where the content can be panned/zoomed
 * (see useZoomPan) and optionally copied. Content-agnostic — wrap a diagram,
 * image, or any node.
 */
export function Zoomable({ children, overlay, onCopy, label = 'Open full view', className }) {
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: cn('group/zoomable relative', className), children: [_jsx("button", { className: "block w-full cursor-zoom-in text-left", onClick: () => setOpen(true), title: label, type: "button", children: children }), _jsx("span", { "aria-hidden": true, className: "pointer-events-none absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-border/70 bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/zoomable:opacity-100", children: _jsx(Maximize, { className: "size-4" }) })] }), open && (_jsx(ZoomPanViewer, { onCopy: onCopy, onOpenChange: setOpen, open: open, children: overlay ?? children }))] }));
}
function ZoomPanViewer({ children, onCopy, onOpenChange, open }) {
    const { panning, reset, stageProps, style, zoomIn, zoomOut } = useZoomPan();
    useEffect(() => {
        if (open) {
            reset();
        }
    }, [open, reset]);
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogContent, { className: "flex h-[85vh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden p-0", showCloseButton: false, children: [_jsx("div", { className: cn('relative flex-1 touch-none select-none overflow-hidden', panning ? 'cursor-grabbing' : 'cursor-grab'), ...stageProps, children: _jsx("div", { className: "absolute inset-0 grid place-items-center", children: _jsx("div", { className: "origin-center", style: style, children: children }) }) }), _jsx(Toolbar, { onClose: () => onOpenChange(false), onCopy: onCopy, reset: reset, zoomIn: zoomIn, zoomOut: zoomOut })] }) }));
}
function Toolbar({ onClose, onCopy, reset, zoomIn, zoomOut }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (!onCopy) {
            return;
        }
        await onCopy();
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };
    return (_jsxs("div", { className: "absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/70 bg-background/85 p-1 shadow-sm backdrop-blur", children: [_jsx(ToolbarButton, { label: "Zoom out", onClick: zoomOut, children: _jsx(ZoomOut, { className: "size-4" }) }), _jsx(ToolbarButton, { label: "Reset", onClick: reset, children: _jsx(RefreshCw, { className: "size-4" }) }), _jsx(ToolbarButton, { label: "Zoom in", onClick: zoomIn, children: _jsx(ZoomIn, { className: "size-4" }) }), onCopy && (_jsxs(_Fragment, { children: [_jsx(Divider, {}), _jsx(ToolbarButton, { label: copied ? 'Copied' : 'Copy', onClick: () => void copy(), children: copied ? _jsx(Check, { className: "size-4" }) : _jsx(Copy, { className: "size-4" }) })] })), _jsx(Divider, {}), _jsx(ToolbarButton, { label: "Close", onClick: onClose, children: _jsx(X, { className: "size-4" }) })] }));
}
function Divider() {
    return _jsx("span", { className: "mx-0.5 h-5 w-px bg-border" });
}
function ToolbarButton({ children, label, onClick }) {
    return (_jsx("button", { "aria-label": label, className: "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", onClick: onClick, title: label, type: "button", children: children }));
}
