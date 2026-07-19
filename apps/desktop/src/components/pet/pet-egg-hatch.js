import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Egg-hatch visuals for the pet generation flow (Cmd-K → Pets → Generate).
 *
 * `PetEggHatch` is the incubation beat shown while `pet.hatch` runs: a wobbling
 * egg that reads as "something is about to hatch" instead of a bare spinner. The
 * reveal celebration is the canvas `PetStarShower`. Motion is disabled under
 * `prefers-reduced-motion`.
 */
import { PixelEggSprite } from '@/components/pet/pixel-egg-sprite';
import { Button } from '@/components/ui/button';
/**
 * Thin progress bar. Determinate when given done/total (hatch rows stream one by
 * one, so a real percentage is meaningful); indeterminate otherwise (drafts
 * return together, so a count would just snap 0→100).
 */
export function PetProgress({ done, total }) {
    const determinate = typeof done === 'number' && typeof total === 'number' && total > 0;
    const pct = determinate ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return (_jsx("div", { "aria-valuemax": 100, "aria-valuemin": 0, "aria-valuenow": determinate ? pct : undefined, className: "pet-progress", role: "progressbar", children: determinate ? (_jsx("div", { className: "pet-progress__fill", style: { width: `${pct}%` } })) : (_jsx("div", { className: "pet-progress__indeterminate" })) }));
}
export function PetEggHatch({ subtitle, onCancel, cancelLabel }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center gap-3", children: [_jsxs("div", { className: "flex flex-col items-center", children: [_jsx(PixelEggSprite, { mode: "bounce", size: 88 }), _jsx("span", { className: "pet-egg-shadow", style: { marginTop: '-0.55rem' } })] }), subtitle && (_jsx("p", { className: "shimmer shimmer-color-primary whitespace-nowrap text-center text-[length:var(--conversation-caption-font-size)] leading-snug text-(--ui-text-tertiary)", children: subtitle })), onCancel && (_jsx(Button, { onClick: onCancel, size: "xs", variant: "text", children: cancelLabel ?? 'Cancel' }))] }));
}
