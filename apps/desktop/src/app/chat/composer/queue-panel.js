import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { StatusRow } from '@/components/chat/status-row';
import { StatusSection } from '@/components/chat/status-section';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { ArrowUp, iconSize, Pencil, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
const entryPreview = (entry, c) => entry.text.trim() || (entry.attachments.length > 0 ? c.attachmentOnly : c.emptyTurn);
export function QueuePanel({ busy, editingId, entries, onDelete, onEdit, onSendNow }) {
    const { t } = useI18n();
    const c = t.composer;
    if (entries.length === 0) {
        return null;
    }
    return (_jsx(StatusSection, { icon: _jsx(Codicon, { className: "text-muted-foreground/70", name: "layers", size: "0.8rem" }), label: c.queued(entries.length), children: entries.map(entry => {
            const isEditing = editingId === entry.id;
            const attachmentsCount = entry.attachments.length;
            return (_jsx(StatusRow, { className: cn('border border-transparent', isEditing && 'border-[color-mix(in_srgb,var(--dt-composer-ring)_40%,transparent)] bg-accent/25'), trailing: _jsxs(_Fragment, { children: [_jsx(Tip, { label: c.queueEdit, children: _jsx(Button, { "aria-label": c.queueEdit, className: "size-5 rounded-md", disabled: Boolean(editingId) && !isEditing, onClick: () => onEdit(entry), size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Pencil, { className: iconSize.xs }) }) }), _jsx(Tip, { label: busy ? c.queueSendNext : c.queueSend, children: _jsx(Button, { "aria-label": busy ? c.queueSendNext : c.queueSend, className: "size-5 rounded-md", disabled: isEditing, onClick: () => onSendNow(entry.id), size: "icon-xs", type: "button", variant: "ghost", children: _jsx(ArrowUp, { className: iconSize.xs }) }) }), _jsx(Tip, { label: c.queueDelete, children: _jsx(Button, { "aria-label": c.queueDelete, className: "size-5 rounded-md", onClick: () => onDelete(entry.id), size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Trash2, { className: iconSize.xs }) }) })] }), trailingVisible: isEditing, children: _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-[0.73rem] leading-4 text-foreground/92", children: entryPreview(entry, c) }), (attachmentsCount > 0 || isEditing) && (_jsxs("div", { className: "mt-0.5 flex items-center gap-1.5 text-[0.64rem] text-muted-foreground/75", children: [attachmentsCount > 0 && _jsx("span", { children: c.attachments(attachmentsCount) }), isEditing && (_jsx("span", { className: "text-[color-mix(in_srgb,var(--dt-composer-ring)_78%,var(--muted-foreground))]", children: c.editingInComposer }))] }))] }) }, entry.id));
        }) }));
}
