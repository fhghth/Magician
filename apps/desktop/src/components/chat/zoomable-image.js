'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useImageDownload } from '@/hooks/use-image-download';
import { useI18n } from '@/i18n';
import { Download } from '@/lib/icons';
import { cn } from '@/lib/utils';
export function ZoomableImage({ className, containerClassName, src, alt, slot, ...props }) {
    const { t } = useI18n();
    const copy = t.desktop;
    const { download, saving } = useImageDownload(src);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const canOpen = Boolean(src);
    return (_jsxs(_Fragment, { children: [_jsxs("span", { className: cn('group/image relative inline-block max-w-full align-top', containerClassName), "data-slot": slot ?? 'aui_zoomable-image', children: [_jsx("button", { className: "contents", disabled: !canOpen, onClick: () => canOpen && setLightboxOpen(true), title: canOpen ? copy.openImage : undefined, type: "button", children: _jsx("img", { alt: alt ?? '', className: className, src: src, ...props }) }), src && (_jsx(ImageActionButton, { className: "group-hover/image:opacity-100", copy: copy, onClick: download, saving: saving }))] }), src && (_jsx(ImageLightbox, { alt: alt, copy: copy, onClick: download, onOpenChange: setLightboxOpen, open: lightboxOpen, saving: saving, src: src }))] }));
}
export function ImageLightbox({ alt, copy, onClick, onOpenChange, open, saving, src }) {
    return (_jsx(Dialog, { onOpenChange: onOpenChange, open: open, children: _jsx(DialogContent, { className: "block w-auto max-h-[calc(100vh-12rem)] max-w-[calc(100vw-12rem)] overflow-visible border-0 bg-transparent p-0 shadow-none", showCloseButton: false, children: _jsxs("div", { className: "group/lightbox relative inline-block", children: [_jsx("img", { alt: alt ?? '', className: "block max-h-[calc(100vh-12rem)] max-w-[calc(100vw-12rem)] cursor-zoom-out select-auto rounded-lg object-contain shadow-2xl", onClick: () => onOpenChange(false), src: src }), _jsx(ImageActionButton, { className: "group-hover/lightbox:opacity-100", copy: copy, onClick: onClick, saving: saving })] }) }) }));
}
export function ImageActionButton({ className, copy, onClick, saving }) {
    return (_jsx("button", { "aria-label": saving ? copy.savingImage : copy.downloadImage, className: cn('absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-border/70 bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:opacity-50', className), disabled: saving, onClick: event => {
            event.stopPropagation();
            void onClick();
        }, title: saving ? copy.savingImage : copy.downloadImage, type: "button", children: _jsx(Download, { className: cn('size-4', saving && 'animate-pulse') }) }));
}
