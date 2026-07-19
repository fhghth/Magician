import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from './codicon';
// Shared swatch grid + clear row used by the profile rail and the project
// dialog, so color picking looks and behaves identically everywhere.
export function ColorSwatches({ swatches, value, onChange, clearLabel, clearIcon = 'circle-slash', swatchLabel }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "grid grid-cols-6 gap-1.5", children: swatches.map(swatch => (_jsx("button", { "aria-label": swatchLabel?.(swatch) ?? swatch, className: "size-5 rounded-full transition-transform hover:scale-110", onClick: () => onChange(swatch), style: {
                        backgroundColor: swatch,
                        boxShadow: swatch === value ? '0 0 0 2px var(--ui-bg-elevated), 0 0 0 3.5px currentColor' : undefined,
                        color: swatch
                    }, type: "button" }, swatch))) }), _jsxs("button", { className: "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-xs text-(--ui-text-tertiary) transition hover:bg-(--ui-control-hover-background) hover:text-foreground", onClick: () => onChange(null), type: "button", children: [_jsx(Codicon, { name: clearIcon, size: "0.75rem" }), clearLabel] })] }));
}
