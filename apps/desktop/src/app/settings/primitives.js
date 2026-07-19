import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PageLoader } from '@/components/page-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PAGE_INSET_X } from '../layout-constants';
export function SettingsContent({ children }) {
    return (_jsx("section", { className: "min-h-0 overflow-hidden", children: _jsx("div", { className: cn('h-full min-h-0 overflow-y-auto pb-20', PAGE_INSET_X), children: children }) }));
}
export function Pill({ tone = 'muted', children }) {
    return _jsx(Badge, { variant: tone === 'primary' ? 'default' : 'muted', children: children });
}
export function SectionHeading({ icon: Icon, title, meta }) {
    return (_jsxs("div", { className: "mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium", children: [_jsx(Icon, { className: "size-4 text-muted-foreground" }), _jsx("span", { children: title }), meta && _jsx(Pill, { children: meta })] }));
}
export function NavLink({ icon: Icon, label, active, onClick }) {
    return (_jsxs(Button, { className: cn('flex min-h-7 w-full justify-start gap-2 rounded-md px-2 text-left text-[length:var(--conversation-text-font-size)] transition', active
            ? 'bg-(--ui-bg-tertiary) text-foreground'
            : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'), onClick: onClick, size: "sm", type: "button", variant: "ghost", children: [_jsx(Icon, { className: "size-4 shrink-0" }), _jsx("span", { className: "min-w-0 flex-1 truncate", children: label })] }));
}
export function ListRow({ title, description, hint, action, below, wide = false }) {
    return (_jsx("div", { className: "@container", children: _jsxs("div", { className: cn('grid gap-3 py-3', !wide && '@2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] @2xl:items-center'), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: title }), description && (_jsx("div", { className: "mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: description })), hint && _jsx("div", { className: "mt-1 block font-mono text-[0.68rem] text-muted-foreground/45", children: hint }), below] }), action && _jsx("div", { className: cn('min-w-0', !wide && '@2xl:justify-self-end'), children: action })] }) }));
}
export function LoadingState({ label }) {
    return _jsx(PageLoader, { label: label });
}
// Canonical implementation lives in components/ui; re-exported so the many
// settings call sites keep their import path.
export { EmptyState } from '@/components/ui/empty-state';
