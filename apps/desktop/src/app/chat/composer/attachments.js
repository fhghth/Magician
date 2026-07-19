import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { AlertCircle, FileText, FolderOpen, ImageIcon, Link, Loader2, Terminal } from '@/lib/icons';
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview';
import { cn } from '@/lib/utils';
import { notifyError } from '@/store/notifications';
import { setCurrentSessionPreviewTarget } from '@/store/preview';
import { $currentCwd } from '@/store/session';
export function AttachmentList({ attachments, onRemove }) {
    return (_jsx("div", { className: "flex max-w-full flex-wrap gap-1.5 px-1 pt-1", "data-slot": "composer-attachments", children: attachments.filter(Boolean).map(attachment => (_jsx(AttachmentPill, { attachment: attachment, onRemove: onRemove }, attachment.id))) }));
}
function AttachmentPill({ attachment, onRemove }) {
    const { t } = useI18n();
    const c = t.composer;
    const Icon = { folder: FolderOpen, url: Link, image: ImageIcon, file: FileText, terminal: Terminal }[attachment.kind];
    const cwd = useStore($currentCwd);
    const isUploading = attachment.uploadState === 'uploading';
    const hasUploadError = attachment.uploadState === 'error';
    const canPreview = attachment.kind !== 'folder' && attachment.kind !== 'terminal' && !isUploading;
    const detail = attachment.detail && attachment.detail !== attachment.label ? attachment.detail : undefined;
    async function openPreview() {
        if (!canPreview) {
            return;
        }
        const rawTarget = attachment.path ||
            attachment.detail ||
            attachment.refText?.replace(/^@(file|image|url):/, '') ||
            attachment.label ||
            '';
        const target = rawTarget.replace(/^`|`$/g, '');
        if (!target) {
            return;
        }
        try {
            const preview = await normalizeOrLocalPreviewTarget(target, cwd || undefined);
            if (!preview) {
                throw new Error(c.couldNotPreview(attachment.label));
            }
            // We already hold the image bytes (the card thumbnail) — render those
            // directly so a screenshot/clipboard image previews even when its only
            // on-disk copy is a transient path the renderer can't re-read.
            const withBytes = attachment.kind === 'image' && attachment.previewUrl
                ? { ...preview, dataUrl: attachment.previewUrl, previewKind: 'image' }
                : preview;
            setCurrentSessionPreviewTarget(withBytes, 'manual', target);
        }
        catch (error) {
            notifyError(error, c.previewUnavailable);
        }
    }
    return (_jsx(Tip, { label: attachment.path || attachment.detail || attachment.label, children: _jsxs("div", { className: "group/attachment relative min-w-0 shrink-0", children: [_jsxs("button", { "aria-busy": isUploading || undefined, "aria-label": canPreview ? c.previewLabel(attachment.label) : attachment.label, className: cn('flex max-w-56 items-center gap-2 rounded-2xl border bg-background/50 px-2 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors disabled:cursor-default', hasUploadError
                        ? 'border-destructive/45 hover:border-destructive/60'
                        : 'border-border/60 hover:border-primary/35 hover:bg-accent/45'), disabled: !canPreview, onClick: () => void openPreview(), type: "button", children: [_jsxs("span", { className: "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/55 bg-muted/35 text-muted-foreground", children: [attachment.previewUrl && attachment.kind === 'image' ? (_jsx("img", { alt: attachment.label, className: "size-full object-cover", draggable: false, src: attachment.previewUrl })) : (_jsx(Icon, { className: "size-3.5" })), isUploading && (_jsx("span", { className: "absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[1px]", children: _jsx(Loader2, { className: "size-3.5 animate-spin text-foreground/75" }) })), hasUploadError && (_jsx("span", { className: "absolute inset-0 grid place-items-center bg-destructive/15", children: _jsx(AlertCircle, { className: "size-3.5 text-destructive" }) }))] }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate text-[0.72rem] font-medium leading-4 text-foreground/90", children: attachment.label }), detail && (_jsx("span", { className: cn('block truncate text-[0.62rem] leading-3.5', hasUploadError ? 'text-destructive/80' : 'text-muted-foreground/65'), children: detail }))] })] }), onRemove && (_jsx("button", { "aria-label": c.removeAttachment(attachment.label), className: "absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full border border-border/70 bg-background text-muted-foreground opacity-0 shadow-xs transition hover:bg-accent hover:text-foreground group-hover/attachment:opacity-100 focus-visible:opacity-100", onClick: () => onRemove(attachment.id), type: "button", children: _jsx(Codicon, { name: "close", size: "0.625rem" }) }))] }) }));
}
