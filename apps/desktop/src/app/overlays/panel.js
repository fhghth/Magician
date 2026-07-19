import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RowButton } from '@/components/ui/row-button';
import { SearchField } from '@/components/ui/search-field';
import { translateNow } from '@/i18n';
import { cn } from '@/lib/utils';
import { OverlayView } from './overlay-view';
export function Panel({ children, className, closeLabel = translateNow('common.close'), contentClassName, onClose }) {
    return (_jsx(OverlayView, { closeLabel: closeLabel, 
        // Top pad aligns the header title's center with the floating close button
        // (which sits at 0.1875rem + titlebar/2, -translate-y-1/2). The X is
        // absolute so it costs no layout space — the header rides up next to it.
        contentClassName: cn('flex h-full min-h-0 flex-col px-4 pb-4 pt-[calc(var(--titlebar-height)/2-0.4375rem)] sm:px-5', contentClassName), onClose: onClose, rootClassName: cn('flex h-full w-full flex-col', className), children: children }));
}
export function PanelHeader({ actions, subtitle, title }) {
    return (_jsxs("header", { className: "mb-3 flex shrink-0 items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-sm font-semibold text-foreground", children: title }), subtitle ? _jsx("p", { className: "truncate text-xs text-muted-foreground/80", children: subtitle }) : null] }), actions ? _jsx("div", { className: "flex shrink-0 items-center gap-1.5", children: actions }) : null] }));
}
export function PanelBody({ children, className }) {
    return (_jsx("div", { className: cn(
        // Side-by-side master/detail on a wide card; once it narrows (same
        // threshold the other overlays collapse at) stack the list above the
        // detail so the detail keeps full width instead of being squished.
        'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden min-[47.5rem]:flex-row min-[47.5rem]:gap-5', className), children: children }));
}
// Left master list. Dense + borderless, like the trace waterfall's label tree:
// single-line rows that touch, separated from the detail only by the body gap.
// An optional search field pins to the top, full-bleed, above the scroll.
export function PanelList({ children, className, onSearchChange, searchLabel, searchPlaceholder, searchHints, searchValue }) {
    return (_jsxs("div", { className: cn('flex w-full shrink-0 flex-col max-[47.5rem]:max-h-[40%] min-[47.5rem]:w-52', className), children: [onSearchChange ? (_jsx(SearchField, { "aria-label": searchLabel ?? searchPlaceholder ?? '', containerClassName: "mb-1 w-full shrink-0", hints: searchHints, onChange: onSearchChange, placeholder: searchPlaceholder ?? '', value: searchValue ?? '' })) : null, _jsx("div", { className: "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain", children: children })] }));
}
// A row is a container (not a <button>) so it can host both the select target
// and a kebab menu without nesting interactive elements. Hover/active bg lives
// on the wrapper so the whole row highlights as one.
export function PanelListRow({ active, dotClassName, icon, lead, menu, meta, onSelect, rowKey, title }) {
    return (_jsxs("div", { className: cn('group/row row-hover relative flex h-7 w-full items-center rounded-md text-[0.78rem] hover:text-foreground', active ? 'bg-(--ui-row-active-background) text-foreground' : 'text-(--ui-text-secondary)'), "data-panel-row": rowKey, children: [_jsxs(RowButton, { className: "flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-2 pr-1 text-left", onClick: onSelect, children: [lead ??
                        (dotClassName ? (_jsx("span", { "aria-hidden": "true", className: cn('size-1.5 shrink-0 rounded-full', dotClassName) })) : icon ? (_jsx(Codicon, { className: "shrink-0 text-muted-foreground/55", name: icon, size: "0.85rem" })) : null), _jsx("span", { className: "min-w-0 flex-1 truncate font-medium text-foreground/85", children: title })] }), meta ? _jsx("span", { className: "shrink-0 pr-2 text-[0.62rem] tabular-nums text-muted-foreground/45", children: meta }) : null, menu ? _jsx("div", { className: "shrink-0 pr-1", children: menu }) : null] }));
}
// Per-row "⋮" actions menu — mirrors the sidebar session row's settled pattern
// (size-5 ghost trigger + kebab-vertical codicon + w-40 content). Hidden until
// the row is hovered/focused (or the menu is open). Returns null with no items
// (e.g. the default profile, which can't be renamed/deleted).
export function PanelRowMenu({ items, label = 'Actions' }) {
    if (items.length === 0) {
        return null;
    }
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": label, className: "size-5 rounded-[4px] bg-transparent text-(--ui-text-tertiary) opacity-0 transition-colors duration-100 hover:bg-(--ui-control-active-background) hover:text-foreground focus-visible:opacity-100 focus-visible:ring-0 group-hover/row:opacity-100 data-[state=open]:bg-(--ui-control-active-background) data-[state=open]:text-foreground data-[state=open]:opacity-100 [&_svg]:size-3.5!", size: "icon", title: label, variant: "ghost", children: _jsx(Codicon, { name: "kebab-vertical", size: "0.875rem" }) }) }), _jsx(DropdownMenuContent, { align: "end", className: "w-40", sideOffset: 6, children: items.map(item => (_jsxs(DropdownMenuItem, { disabled: item.disabled, onSelect: item.onSelect, variant: item.tone === 'danger' ? 'destructive' : undefined, children: [item.icon ? _jsx(Codicon, { name: item.icon, size: "0.875rem" }) : null, _jsx("span", { children: item.label })] }, item.label))) })] }));
}
// Scrolling detail region. Fills the column (no right rail here, unlike the
// trace inspector), so the content stretches the full available width.
export function PanelDetail({ children, className }) {
    return (_jsx("div", { className: cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className), children: _jsx("div", { className: "space-y-4 pb-6 pl-1 pr-2", children: children }) }));
}
export function PanelEmpty({ action, description, icon = 'inbox', title }) {
    return (_jsx("div", { className: "grid flex-1 place-items-center px-6 py-10 text-center", children: _jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx(Codicon, { className: "text-muted-foreground/50", name: icon, size: "1.25rem" }), title ? _jsx("p", { className: "text-sm font-medium text-foreground/90", children: title }) : null, description ? (_jsx("p", { className: "max-w-sm text-xs leading-relaxed text-muted-foreground/70", children: description })) : null, action ? _jsx("div", { className: "mt-2", children: action }) : null] }) }));
}
export function PanelSectionLabel({ children, className }) {
    return (_jsx("div", { className: cn('text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground/50', className), children: children }));
}
export function PanelMeta({ className, rows }) {
    return (_jsx("dl", { className: cn('grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-[0.7rem]', className), children: rows.map((row, i) => (_jsxs("div", { className: "contents", children: [_jsx("dt", { className: "truncate text-muted-foreground/55", children: row.label }), _jsx("dd", { className: "min-w-0 break-words text-foreground/85", children: row.value })] }, typeof row.label === 'string' ? row.label : i))) }));
}
// Monospace content block (job prompt, etc.) — mirrors the inspector's
// input/output <pre> blocks: subtle bg, no border.
export function PanelBlock({ children, className }) {
    return (_jsx("pre", { className: cn('max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-foreground/5 p-2.5 text-[0.68rem] leading-relaxed text-foreground/80', className), children: children }));
}
const PILL_TONE = {
    bad: 'bg-destructive/10 text-destructive',
    good: 'bg-primary/10 text-primary',
    muted: 'bg-foreground/10 text-muted-foreground',
    warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
};
export function PanelPill({ children, tone = 'muted' }) {
    return (_jsx("span", { className: cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.62rem] font-medium capitalize', PILL_TONE[tone]), children: children }));
}
// Self-describing centered "+" that sits as the LAST item in a PanelList. The
// label rides aria/title only — no visible text.
export function PanelAddButton({ icon = 'add', label, onClick }) {
    return (_jsx(Button, { "aria-label": label, className: "h-7 w-full shrink-0 justify-center text-muted-foreground/70 hover:bg-(--ui-row-hover-background) hover:text-foreground", onClick: onClick, size: "sm", title: label, variant: "ghost", children: _jsx(Codicon, { name: icon, size: "0.875rem" }) }));
}
// Visible ghost action for a detail header (cron pause/resume/trigger, …).
export function PanelAction({ children, disabled, icon, onClick }) {
    return (_jsxs(Button, { className: "gap-1.5 text-muted-foreground hover:bg-(--ui-row-hover-background) hover:text-foreground", disabled: disabled, onClick: onClick, size: "sm", variant: "ghost", children: [_jsx(Codicon, { name: icon, size: "0.875rem" }), children] }));
}
