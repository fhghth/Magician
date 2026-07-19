import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CountSkeleton } from '@/components/ui/skeleton';
import { TextTab, TextTabMeta } from '@/components/ui/text-tab';
import { compactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
export function tabMetaContent(meta) {
    return meta === null ? _jsx(CountSkeleton, {}) : typeof meta === 'number' ? compactNumber(meta) : meta;
}
function TabDropdownIcon({ icon: Icon, indent }) {
    return _jsx(Icon, { className: cn('shrink-0 text-muted-foreground/80', indent ? 'size-3.5' : 'size-4') });
}
/** The Capabilities tab dropdown: a borderless "Label ⌄" trigger and a menu of
 *  labels with right-aligned meta. The single narrow-width collapse used by
 *  every responsive tab/nav in the app. */
export function TabDropdown({ align = 'center', className, items }) {
    const active = items.find(item => item.active) ?? items[0];
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsxs("button", { className: "flex h-7 cursor-pointer items-center gap-1.5 px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-foreground [-webkit-app-region:no-drag]", type: "button", children: [active?.icon && _jsx(TabDropdownIcon, { icon: active.icon, indent: active.indent }), _jsx("span", { className: "min-w-0 truncate", children: active?.label }), active?.meta !== undefined && _jsx(TextTabMeta, { children: tabMetaContent(active.meta) }), _jsx(Codicon, { className: "text-muted-foreground", name: "chevron-down", size: "0.75rem" })] }) }), _jsx(DropdownMenuContent, { align: align, className: cn('w-44', className), sideOffset: 6, children: items.map((item, index) => (_jsxs(Fragment, { children: [item.separatorBefore && index > 0 && _jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuItem, { className: cn(item.indent && 'pl-6', item.active && 'text-foreground'), onSelect: item.onSelect, children: [item.icon && _jsx(TabDropdownIcon, { icon: item.icon, indent: item.indent }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: item.label }), item.meta !== undefined && (_jsx("span", { className: "text-xs text-muted-foreground", children: tabMetaContent(item.meta) }))] })] }, item.id))) })] }));
}
/** Centered/left `TextTab` row on wide viewports that collapses into a single
 *  `TabDropdown` once the header can't fit it — the shared behavior behind the
 *  Capabilities page tabs, log-source switches, etc. */
export function ResponsiveTabs({ align = 'center', onChange, tabs, value, wideClassName }) {
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: cn('hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex', wideClassName), children: tabs.map(tab => (_jsxs(TextTab, { active: tab.id === value, onClick: () => onChange(tab.id), children: [tab.label, tab.meta !== undefined && _jsx(TextTabMeta, { children: tabMetaContent(tab.meta) })] }, tab.id))) }), _jsx("div", { className: "md:hidden", children: _jsx(TabDropdown, { align: align, items: tabs.map(tab => ({
                        active: tab.id === value,
                        id: tab.id,
                        label: tab.label,
                        meta: tab.meta,
                        onSelect: () => onChange(tab.id)
                    })) }) })] }));
}
