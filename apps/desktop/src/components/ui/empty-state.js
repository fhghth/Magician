import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
// Canonical centered empty state (title + description). The default for "no
// results / nothing here yet" page bodies. For richer master-detail lists that
// want an icon + action, use PanelEmpty (overlays/panel); the file-tree's
// inline uppercase error state is its own deliberately-distinct treatment.
export function EmptyState({ title, description, className }) {
    return (_jsx("div", { className: cn('grid min-h-48 place-items-center text-center', className), children: _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: title }), description && _jsx("div", { className: "mt-1 text-xs text-muted-foreground", children: description })] }) }));
}
