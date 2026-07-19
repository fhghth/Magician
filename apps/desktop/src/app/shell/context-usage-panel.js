import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { compactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
export function ContextUsagePanel({ currentUsage, requestGateway, sessionId }) {
    const { t } = useI18n();
    const copy = t.shell.statusbar.contextUsagePanel;
    const [breakdown, setBreakdown] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!sessionId) {
            setBreakdown(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        void requestGateway('session.context_breakdown', { session_id: sessionId })
            .then(data => {
            if (!cancelled) {
                setBreakdown(data);
            }
        })
            .catch(() => {
            if (!cancelled) {
                setBreakdown(null);
            }
        })
            .finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [requestGateway, sessionId]);
    const contextMax = breakdown?.context_max ?? currentUsage.context_max ?? 0;
    const contextUsed = breakdown?.context_used ?? currentUsage.context_used ?? 0;
    const contextPercent = Math.max(0, Math.min(100, Math.round(breakdown?.context_percent ?? currentUsage.context_percent ?? 0)));
    const categories = useMemo(() => (breakdown?.categories ?? []).map(category => ({
        ...category,
        label: copy.categories[category.id] ?? category.label
    })), [breakdown?.categories, copy]);
    const segmentTotal = categories.reduce((sum, category) => sum + category.tokens, 0) || contextUsed || 1;
    return (_jsxs("div", { className: "flex w-72 flex-col gap-3 p-3 text-[0.75rem]", "data-slot": "context-usage-panel", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [_jsx("p", { className: "font-medium text-foreground", children: copy.title }), _jsx("span", { className: "text-[0.6875rem] text-muted-foreground", children: copy.tokenSummary(`~${compactNumber(contextUsed)}`, compactNumber(contextMax)) })] }), _jsx("p", { className: "text-[0.6875rem] text-foreground", children: copy.percentFull(contextPercent) }), _jsx(ContextUsageBar, { categories: categories, segmentTotal: segmentTotal }), _jsx("ul", { className: "flex flex-col gap-1.5", children: categories.map(category => (_jsxs("li", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: "flex min-w-0 items-center gap-2", children: [_jsx("span", { className: "size-2 shrink-0 rounded-[2px]", style: { background: category.color } }), _jsx("span", { className: "truncate text-muted-foreground", children: category.label })] }), _jsx("span", { className: "shrink-0 tabular-nums text-foreground", children: compactNumber(category.tokens) })] }, category.id))) }), loading && _jsx("p", { className: "text-[0.6875rem] text-muted-foreground", children: copy.loading }), !loading && !categories.length && _jsx("p", { className: "text-[0.6875rem] text-muted-foreground", children: copy.empty })] }));
}
function ContextUsageBar({ categories, segmentTotal }) {
    return (_jsx("div", { className: cn('flex h-1.5 overflow-hidden rounded-full', categories.length ? 'bg-(--ui-stroke-tertiary)' : 'dither bg-(--ui-bg-elevated)'), "data-slot": "context-usage-bar", children: categories.map(category => (_jsx("span", { className: "h-full min-w-px", style: {
                background: category.color,
                width: `${(category.tokens / segmentTotal) * 100}%`
            } }, category.id))) }));
}
