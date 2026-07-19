import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
// Shared chrome styling for interactive statusbar items (button / link / menu
// trigger). The 'text' variant intentionally omits hover/transition/disabled.
const STATUSBAR_ACTION_CLASS = 'inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground disabled:cursor-default disabled:opacity-45';
export function StatusbarControls({ className, leftItems = [], items = [], ...props }) {
    const navigate = useNavigate();
    return (_jsxs("footer", { className: cn('flex h-5 shrink-0 items-stretch justify-between gap-2 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-1 py-0 text-(--ui-text-tertiary) [-webkit-app-region:no-drag]', className), "data-slot": "statusbar", ...props, children: [_jsx("div", { className: "flex min-w-0 items-stretch gap-0.5 overflow-x-clip", children: leftItems
                    .filter(item => !item.hidden)
                    .map(item => (_jsx(StatusbarItemView, { item: item, navigate: navigate }, `left:${item.id}`))) }), _jsx("div", { className: "flex min-w-0 items-stretch gap-0.5 overflow-x-clip", children: items
                    .filter(item => !item.hidden)
                    .map(item => (_jsx(StatusbarItemView, { item: item, navigate: navigate }, `right:${item.id}`))) })] }));
}
function StatusbarItemView({ item, navigate }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const content = (_jsxs(_Fragment, { children: [item.icon, item.label && _jsx("span", { className: "truncate", children: item.label }), item.detail && _jsx("span", { className: "truncate text-muted-foreground/80", children: item.detail })] }));
    if (item.variant === 'menu' && (item.menuContent || (item.menuItems && item.menuItems.length > 0))) {
        // The `Tip` helper can't wrap a menu: its TooltipTrigger needs a DOM child,
        // but DropdownMenu's Root renders no element, so the hover listeners never
        // land on the button and the tooltip silently never shows. Compose the two
        // trigger Slots directly onto the same <button> instead (both asChild), the
        // way profile-switcher.tsx stacks Popover/ContextMenu/Tooltip triggers.
        const trigger = (_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { className: cn(STATUSBAR_ACTION_CLASS, item.className), disabled: item.disabled, type: "button", children: content }) }));
        return (_jsxs(DropdownMenu, { onOpenChange: setMenuOpen, open: menuOpen, children: [item.title ? (_jsx(TooltipProvider, { delayDuration: 0, children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: trigger }), _jsx(TooltipContent, { children: item.title })] }) })) : (trigger), _jsx(DropdownMenuContent, { align: item.menuAlign ?? 'start', className: cn('w-56', item.menuContent && 'p-0', item.menuClassName), side: "top", sideOffset: 8, children: item.menuContent
                        ? typeof item.menuContent === 'function'
                            ? item.menuContent(() => setMenuOpen(false))
                            : item.menuContent
                        : (item.menuItems ?? [])
                            .filter(menuItem => !menuItem.hidden)
                            .map(menuItem => (_jsx(DropdownMenuItem, { className: cn('gap-2 text-foreground focus:bg-accent [&_svg]:size-4', menuItem.className), disabled: menuItem.disabled, onSelect: () => {
                                if (menuItem.to) {
                                    navigate(menuItem.to);
                                }
                                menuItem.onSelect?.();
                            }, children: menuItem.href ? (_jsxs("a", { className: "inline-flex w-full items-center gap-2", href: menuItem.href, rel: "noreferrer", target: "_blank", children: [menuItem.icon, _jsx("span", { className: "truncate", children: menuItem.label })] })) : (_jsxs(_Fragment, { children: [menuItem.icon, _jsx("span", { className: "truncate", children: menuItem.label })] })) }, menuItem.id))) })] }));
    }
    if (item.variant === 'text' && !item.onSelect && !item.to && !item.href) {
        return (_jsx(Tip, { label: item.title, children: _jsx("div", { className: cn('inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)', item.className), children: content }) }));
    }
    if (item.href || item.variant === 'link') {
        return (_jsx(Tip, { label: item.title, children: _jsx("a", { className: cn(STATUSBAR_ACTION_CLASS, item.className), href: item.href, rel: "noreferrer", target: "_blank", children: content }) }));
    }
    return (_jsx(Tip, { label: item.title, children: _jsx("button", { className: cn(STATUSBAR_ACTION_CLASS, item.className), disabled: item.disabled, onClick: event => {
                if (item.to) {
                    navigate(item.to);
                }
                item.onSelect?.({ shiftKey: event.shiftKey });
            }, type: "button", children: content }) }));
}
