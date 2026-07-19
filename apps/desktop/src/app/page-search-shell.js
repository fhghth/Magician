import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { SearchField } from '@/components/ui/search-field';
import { ResponsiveTabs } from '@/components/ui/tab-dropdown';
import { cn } from '@/lib/utils';
function ShellTabs({ tabs, activeTab, onTabChange }) {
    return (_jsx(ResponsiveTabs, { onChange: id => onTabChange?.(id), tabs: tabs, value: activeTab ?? tabs[0]?.id ?? '', wideClassName: "justify-center" }));
}
export function PageSearchShell({ children, className, tabs, activeTab, onTabChange, filters, onSearchChange, searchPlaceholder, searchHints, searchValue, searchHidden = false, searchTrailingAction, ...props }) {
    const hasTabs = (tabs?.length ?? 0) > 0;
    return (_jsxs("section", { ...props, className: cn('flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)', className), children: [_jsxs("div", { className: "shrink-0", children: [(hasTabs || !searchHidden) && (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]", children: [_jsx("div", { className: "flex min-w-0 items-center justify-start", children: !searchHidden && (_jsx(SearchField, { containerClassName: "max-w-[45vw]", hints: searchHints, onChange: onSearchChange, placeholder: searchPlaceholder, value: searchValue })) }), hasTabs ? _jsx(ShellTabs, { activeTab: activeTab, onTabChange: onTabChange, tabs: tabs }) : _jsx("span", {}), _jsx("div", { className: "flex min-w-0 items-center justify-end", children: searchTrailingAction })] })), filters ? _jsx("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2", children: filters }) : null] }), _jsx("div", { className: "min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)", children: children })] }));
}
