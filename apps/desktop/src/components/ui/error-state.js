import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { AlertTriangle } from '@/lib/icons';
import { cn } from '@/lib/utils';
// The single canonical error glyph (codicon's filled error mark). Use this
// everywhere an error is surfaced (boundaries, dialogs, banners) so failures
// read identically — one icon, one color, no background chip.
export function ErrorIcon({ className, size = '1.75rem' }) {
    return _jsx(Codicon, { className: cn('text-destructive', className), name: "error", size: size });
}
// Inline error banner for detail panes (born in Messaging's platform error,
// now shared with the MCP config pane): warn glyph + tinted rounded box.
// For centered full-surface failures use ErrorState below instead.
export function ErrorBanner({ children, className }) {
    return (_jsxs("div", { className: cn('flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-destructive', className), children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { className: "min-w-0 whitespace-pre-wrap break-words", children: children })] }));
}
// Shared, presentation-only error layout: the canonical ErrorIcon (no bg chip)
// over a centered title + body, with an optional actions stack. Used by the
// React error boundary, the in-dialog update error, and the boot-failure banner
// so every failure reads the same. Title/description accept nodes so Radix
// Dialog callers can pass DialogTitle/DialogDescription for accessibility.
export function ErrorState({ children, className, description, icon, title }) {
    return (_jsxs("div", { className: cn('grid gap-5', className), children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [icon ?? _jsx(ErrorIcon, {}), typeof title === 'string' ? (_jsx("h2", { className: "text-center text-xl font-semibold tracking-tight", children: title })) : (title), typeof description === 'string' ? (_jsx("p", { className: "max-w-prose text-center text-sm leading-5 text-muted-foreground", children: description })) : (description)] }), children && _jsx("div", { className: "grid gap-2", children: children })] }));
}
