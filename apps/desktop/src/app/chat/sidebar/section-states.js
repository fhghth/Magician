import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
export function SidebarSessionSkeletons() {
    return (_jsx("div", { "aria-hidden": "true", className: "grid gap-px", children: ['w-32', 'w-40', 'w-28', 'w-36', 'w-24'].map((width, i) => (_jsxs("div", { className: "grid min-h-[1.625rem] grid-cols-[minmax(0,1fr)_1.375rem] items-center rounded-md pl-2", children: [_jsx(Skeleton, { className: cn('h-3 rounded-sm', width) }), _jsx(Skeleton, { className: "mx-auto size-3.5 rounded-sm opacity-60" })] }, `${width}-${i}`))) }));
}
export function SidebarBlankState({ onNewProject }) {
    const { t } = useI18n();
    const s = t.sidebar;
    return (_jsx("div", { className: "grid min-h-0 flex-1 place-items-center px-4 text-center", children: _jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx(Codicon, { className: "text-(--ui-text-quaternary)", name: "root-folder", size: "1.25rem" }), _jsx("p", { className: "text-xs text-(--ui-text-tertiary)", children: s.noSessions }), _jsxs(Button, { className: "mt-0.5 text-(--ui-text-secondary)", onClick: onNewProject, size: "sm", variant: "ghost", children: [_jsx(Codicon, { name: "add", size: "0.75rem" }), s.projects.newButton] })] }) }));
}
export function SidebarPinnedEmptyState() {
    const { t } = useI18n();
    return (_jsxs("div", { className: "flex min-h-7 items-center gap-1.5 rounded-lg pl-2 text-[0.75rem] text-(--ui-text-tertiary)", children: [_jsx("span", { className: "grid w-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)", children: _jsx(Codicon, { name: "pin", size: "0.75rem" }) }), _jsx("span", { children: t.sidebar.shiftClickHint })] }));
}
