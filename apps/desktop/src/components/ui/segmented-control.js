import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
/**
 * Grouped one-row toggle used for small mutually-exclusive choices
 * (color mode, tool-call display, usage period, etc.). Flat by design —
 * no per-option borders, just a tinted track with a raised active pill.
 */
export function SegmentedControl({ options, value, onChange, className }) {
    return (_jsx("div", { className: cn('inline-grid w-fit auto-cols-fr grid-flow-col gap-0.5 rounded-[5px] bg-(--ui-bg-tertiary) p-0.5', className), children: options.map(({ id, label, icon: Icon }) => {
            const active = value === id;
            return (_jsxs("button", { "aria-pressed": active, className: cn('flex items-center justify-center gap-1 rounded-[3px] px-2.5 py-0.5 text-[0.6875rem] font-medium transition-colors', active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'), onClick: () => onChange(id), type: "button", children: [Icon && _jsx(Icon, { className: "size-3" }), label] }, id));
        }) }));
}
