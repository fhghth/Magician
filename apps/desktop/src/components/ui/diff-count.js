import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
// Snappy spring — fast transitions per the design.
const SPRING = { stiffness: 320, damping: 30, mass: 0.5 };
// A single integer that springs to its value via Motion (renders the motion
// value straight to the DOM, no per-frame React re-render). It initialises AT
// its value, so mounting/navigating shows it instantly — only a real change to
// the number (a live edit) springs it up/down. Switching threads in the same
// worktree (same numbers) therefore doesn't animate.
function AnimatedInt({ value }) {
    const spring = useSpring(value, SPRING);
    const text = useTransform(spring, latest => Math.round(latest).toString());
    useEffect(() => {
        spring.set(value);
    }, [value, spring]);
    return _jsx(motion.span, { children: text });
}
/** Animated `+A −B` line-count, green/red via the top-level theme vars. Each
 *  number springs up/down via Motion (0 → value on first mount). */
export function DiffCount({ added, removed, className }) {
    if (!added && !removed) {
        return null;
    }
    return (_jsxs("span", { className: cn('flex shrink-0 items-center gap-1 tabular-nums', className), children: [added > 0 && (_jsxs("span", { className: "text-(--ui-green)", children: ["+", _jsx(AnimatedInt, { value: added })] })), removed > 0 && (_jsxs("span", { className: "text-(--ui-red)", children: ["\u2212", _jsx(AnimatedInt, { value: removed })] }))] }));
}
