import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ImageLightbox } from '@/components/chat/zoomable-image';
import { useImageDownload } from '@/hooks/use-image-download';
import { useI18n } from '@/i18n';
import { X } from '@/lib/icons';
// The reference photo as an attachment chip: filename + thumbnail that opens
// the shared image viewer (lightbox), with a remove affordance.
export function ReferenceChip({ name, onRemove, src }) {
    const { t } = useI18n();
    const { download, saving } = useImageDownload(src);
    const [viewing, setViewing] = useState(false);
    return (_jsxs("div", { className: "ml-auto flex h-6 items-center gap-2 self-start rounded-lg border border-border/60 bg-background/50 pl-1 pr-2", children: [_jsx("button", { className: "shrink-0", onClick: () => setViewing(true), title: t.desktop.openImage, type: "button", children: _jsx("img", { alt: name, className: "size-4 rounded-md object-cover", src: src }) }), _jsx("span", { className: "max-w-40 truncate text-[0.64rem] font-medium text-foreground/50", children: name || 'Reference' }), _jsx("button", { "aria-label": "Remove reference", className: "text-(--ui-text-tertiary) transition not-hover:opacity-50", onClick: onRemove, type: "button", children: _jsx(X, { className: "size-3" }) }), _jsx(ImageLightbox, { alt: name, copy: t.desktop, onClick: download, onOpenChange: setViewing, open: viewing, saving: saving, src: src })] }));
}
