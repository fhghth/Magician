import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
export function SidebarPanelLabel({ children, className, dotClassName, ...props }) {
    return (_jsxs("span", { className: cn('flex min-w-0 items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)', className), ...props, children: [_jsx("span", { "aria-hidden": "true", className: cn('dither inline-block size-2 shrink-0 rounded-[1px]', dotClassName) }), _jsx("span", { className: "min-w-0 truncate leading-none", children: children })] }));
}
