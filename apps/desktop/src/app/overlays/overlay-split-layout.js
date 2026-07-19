import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment } from 'react';
import { TabDropdown } from '@/components/ui/tab-dropdown';
import { cn } from '@/lib/utils';
import { PAGE_INSET_X, PAGE_MAX_W } from '../layout-constants';
// The wide rail and the narrow dropdown swap at exactly the width where
// OverlaySplitLayout drops to a single column, so the rail never stacks.
const RAIL_HIDDEN = 'max-[47.5rem]:hidden';
const BAR_HIDDEN = 'hidden max-[47.5rem]:flex';
export function OverlaySplitLayout({ children, className }) {
    return (_jsx("div", { className: cn(
        // Narrow: one column, and pin rows to [nav-bar auto | main 1fr] — without
        // an explicit template the grid's default align-content:stretch splits the
        // height evenly across the two rows, shoving the content to mid-screen.
        'grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden bg-transparent max-[47.5rem]:grid-cols-1 max-[47.5rem]:grid-rows-[auto_minmax(0,1fr)]', className), children: children }));
}
export function OverlaySidebar({ children, className }) {
    return (_jsx("aside", { className: cn(
        // pt clears the in-card close button (the OverlayView now insets the
        // whole card below the OS titlebar); the bg fills from the card's top
        // edge so there's no surface-colored gap above the sidebar.
        'flex min-h-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-2.5 pb-3 pt-[calc(var(--titlebar-height)/2+1rem)]', className), children: children }));
}
export function OverlayMain({ children, className }) {
    return (_jsx("main", { className: cn(
        // Narrow: the OverlayNav dropdown bar already clears the titlebar, so
        // drop the tall top pad to a normal gap below it.
        'mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent pb-3 pt-[calc(var(--titlebar-height)/2+1rem)] max-[47.5rem]:pt-2', PAGE_MAX_W, PAGE_INSET_X, className), children: children }));
}
export function OverlayNavItem({ active, icon: Icon, label, nested, onClick, trailing }) {
    return (_jsxs("button", { className: cn('flex h-7 w-full items-center justify-start gap-2 rounded-md border px-2 text-left text-[length:var(--conversation-text-font-size)] font-normal transition-colors', nested
            ? active
                ? 'border-transparent bg-(--chrome-action-hover) font-medium text-foreground'
                : 'border-transparent bg-transparent text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
            : active
                ? 'border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) text-foreground'
                : 'border-transparent bg-transparent text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'), onClick: onClick, type: "button", children: [_jsx(Icon, { className: cn('shrink-0', nested ? 'size-3.5' : 'size-4', active ? 'text-foreground/80' : 'text-muted-foreground/80') }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: label }), trailing] }));
}
// Data-driven pane nav: one model renders a persistent left rail on wide
// viewports and a single dropdown bar on narrow ones (matching the tab
// dropdown in PageSearchShell), so every OverlaySplitLayout pane degrades the
// same way instead of stacking its whole sidebar. Drop it in as the first
// child of an OverlaySplitLayout, before OverlayMain.
export function OverlayNav({ footer, groups }) {
    return (_jsxs(_Fragment, { children: [_jsxs(OverlaySidebar, { className: RAIL_HIDDEN, children: [groups.map(group => (_jsxs(Fragment, { children: [group.gapBefore && _jsx("div", { "aria-hidden": true, className: "h-2" }), _jsx(OverlayNavItem, { active: group.active, icon: group.icon, label: group.label, onClick: group.onSelect }), group.children && group.active && (_jsx("div", { className: "ml-3.5 flex flex-col gap-0.5 pl-1.5", children: group.children.map(child => (_jsx(OverlayNavItem, { active: child.active, icon: child.icon, label: child.label, nested: true, onClick: child.onSelect }, child.id))) }))] }, group.id))), footer && _jsx("div", { className: "mt-auto flex items-center gap-1 pt-2", children: footer })] }), _jsxs("div", { className: cn('pointer-events-none relative z-20 h-[calc(var(--titlebar-height)+0.1875rem)] items-center justify-between gap-2 pl-3 pr-12', BAR_HIDDEN), children: [_jsx("div", { className: "pointer-events-auto min-w-0 [-webkit-app-region:no-drag]", children: _jsx(TabDropdown, { align: "start", items: groups.flatMap(group => [
                                {
                                    active: group.active && !group.children?.some(child => child.active),
                                    icon: group.icon,
                                    id: group.id,
                                    label: group.label,
                                    onSelect: group.onSelect,
                                    separatorBefore: group.gapBefore
                                },
                                ...(group.children ?? []).map(child => ({
                                    active: child.active,
                                    icon: child.icon,
                                    id: child.id,
                                    indent: true,
                                    label: child.label,
                                    onSelect: child.onSelect
                                }))
                            ]) }) }), footer && (_jsx("div", { className: "pointer-events-auto flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]", children: footer }))] })] }));
}
