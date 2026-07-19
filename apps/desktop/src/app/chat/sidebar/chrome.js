import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { RowButton } from '@/components/ui/row-button';
import { cn } from '@/lib/utils';
// Shared, content-agnostic sidebar chrome — used by both the flat session
// sections and the project/workspace tree, so it lives outside either to keep
// imports one-directional (no index <-> projects cycle).
/** `loaded/total` when there's more on the server, else just the loaded count. */
export const countLabel = (loaded, total) => total > loaded ? `${loaded}/${total}` : String(loaded);
/** The muted count chip next to a section/workspace label. */
export function SidebarCount({ children }) {
    return _jsx("span", { className: "text-[0.6875rem] font-medium text-(--ui-text-quaternary)", children: children });
}
// ── Row geometry (session row is canonical — everything composes these) ─────
//
// Height lives ONLY on SidebarRowShell (min-h-[1.625rem]). Inset children
// stretch to fill the cell and center content internally — never items-center
// on the shell grid, or short clusters (projects) float 1–2px off sessions.
const rowMinH = 'min-h-[1.625rem]';
const rowPadX = 'pl-2 pr-1';
const rowGap = 'gap-1.5';
const rowLead = 'grid size-3.5 shrink-0 place-items-center';
const rowInset = cn(rowPadX, rowGap, 'flex h-full min-w-0 items-center self-stretch py-0.5');
const rowLabel = 'min-w-0 truncate text-[0.8125rem] leading-none text-(--ui-text-secondary)';
/** Codicon size in sidebar row leads — matches the file tree (`tree.tsx`). */
export const SIDEBAR_LEAD_ICON_SIZE = '0.875rem';
/** Vertical stack of rows (gap-px, single column). */
export function SidebarRowStack({ className, ...props }) {
    return _jsx("div", { className: cn('grid grid-cols-[minmax(0,1fr)] gap-px', className), ...props });
}
/** Nested rows (session previews, worktree bodies). */
export function SidebarRowNest({ className, ...props }) {
    return _jsx(SidebarRowStack, { className: cn('pb-1 pl-4', className), ...props });
}
/** Outer grid — sole owner of row height. */
export function SidebarRowShell({ actions, children, className, ...props }) {
    return (_jsxs("div", { className: cn(rowMinH, 'grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md', className), ...props, children: [children, actions ? _jsx("div", { className: "flex shrink-0 items-center self-center", children: actions }) : null] }));
}
/** Multi-control left cluster (project rows). */
export function SidebarRowCluster({ className, ...props }) {
    return _jsx("div", { className: cn(rowInset, className), ...props });
}
/** Session row main tap target. */
export function SidebarRowBody({ className, ...props }) {
    return _jsx(RowButton, { className: cn(rowInset, 'bg-transparent text-left', className), ...props });
}
/** Tappable label — underline/truncate live on the inner span, not the button. */
export function SidebarRowLink({ className, labelClassName, children, ...props }) {
    return (_jsx(RowButton, { className: cn('min-w-0 shrink bg-transparent p-0 text-left', className), ...props, children: _jsx("span", { className: cn(rowLabel, labelClassName), children: children }) }));
}
/** Fixed leading column (dot, icon, drag handle). */
export function SidebarRowLead({ className, ...props }) {
    return _jsx("span", { className: cn(rowLead, className), ...props });
}
/** Standard row label typography. */
export function SidebarRowLabel({ className, ...props }) {
    return _jsx("span", { className: cn(rowLabel, className), ...props });
}
/** Dot ↔ grabber swap for dnd-kit reorder rows. */
export function SidebarRowGrab({ ariaLabel, children, className, dragging = false, dragHandleProps, leadClassName }) {
    return (_jsxs(SidebarRowLead, { ...dragHandleProps, "aria-label": ariaLabel, className: cn('group/handle relative cursor-grab touch-none overflow-hidden active:cursor-grabbing', leadClassName, className), "data-reorder-handle": true, onClick: event => event.stopPropagation(), children: [_jsx("span", { className: "grid size-full place-items-center transition-opacity group-hover/handle:opacity-0 group-focus-within/handle:opacity-0", children: children }), _jsx(Codicon, { className: cn('absolute text-(--ui-text-quaternary) opacity-0 transition-opacity group-hover/handle:opacity-80 group-focus-within/handle:opacity-80 hover:text-(--ui-text-secondary)', dragging && 'text-(--ui-text-secondary) opacity-100'), name: "grabber", size: "0.75rem" })] }));
}
/** Icon/dot slot inside SidebarRowLead — caps visual size so rows align. */
export function SidebarRowLeadGlyph({ children, className, style }) {
    return (_jsx("span", { className: cn('grid size-full place-items-center text-(--ui-text-tertiary) [&_.codicon]:leading-none', className), style: style, children: children }));
}
