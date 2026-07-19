import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
function Pagination({ className, ...props }) {
    const { t } = useI18n();
    return (_jsx("nav", { "aria-label": t.ui.pagination.label, className: cn('mx-auto flex w-full justify-center', className), "data-slot": "pagination", ...props }));
}
function PaginationContent({ className, ...props }) {
    return (_jsx("ul", { className: cn('flex h-5 flex-row items-center gap-0.5', className), "data-slot": "pagination-content", ...props }));
}
function PaginationItem({ className, ...props }) {
    return _jsx("li", { className: cn('flex h-5 items-center', className), "data-slot": "pagination-item", ...props });
}
function PaginationButton({ className, isActive, ...props }) {
    return (_jsx("button", { "aria-current": isActive ? 'page' : undefined, className: cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-transparent px-1 text-[0.6875rem] leading-none tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-45', isActive
            ? 'border-border bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground', className), "data-active": isActive, "data-slot": "pagination-button", type: "button", ...props }));
}
function PaginationPrevious({ className, ...props }) {
    const { t } = useI18n();
    return (_jsxs("button", { "aria-label": t.ui.pagination.previousAria, className: cn('inline-flex h-5 items-center justify-center gap-0.5 rounded border border-transparent px-1 text-[0.6875rem] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45', className), "data-slot": "pagination-previous", type: "button", ...props, children: [_jsx(Codicon, { name: "chevron-left", size: "0.75rem" }), _jsx("span", { children: t.ui.pagination.previous })] }));
}
function PaginationNext({ className, ...props }) {
    const { t } = useI18n();
    return (_jsxs("button", { "aria-label": t.ui.pagination.nextAria, className: cn('inline-flex h-5 items-center justify-center gap-0.5 rounded border border-transparent px-1 text-[0.6875rem] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45', className), "data-slot": "pagination-next", type: "button", ...props, children: [_jsx("span", { children: t.ui.pagination.next }), _jsx(Codicon, { name: "chevron-right", size: "0.75rem" })] }));
}
function PaginationEllipsis({ className, ...props }) {
    return (_jsx("span", { "aria-hidden": true, className: cn('flex size-5 items-center justify-center', className), "data-slot": "pagination-ellipsis", ...props, children: _jsx(Codicon, { name: "ellipsis", size: "0.75rem" }) }));
}
export { Pagination, PaginationButton, PaginationContent, PaginationEllipsis, PaginationItem, PaginationNext, PaginationPrevious };
