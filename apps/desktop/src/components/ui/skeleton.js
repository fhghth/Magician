import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
function Skeleton({ className, ...props }) {
    return _jsx("div", { className: cn('animate-pulse rounded-md bg-accent', className), "data-slot": "skeleton", ...props });
}
/** Inline pulsing chip standing in for a small count/badge while it loads. */
function CountSkeleton({ className, ...props }) {
    return (_jsx("span", { className: cn('inline-block h-2 w-3.5 translate-y-px animate-pulse rounded-sm bg-current/25', className), "data-slot": "count-skeleton", ...props }));
}
export { CountSkeleton, Skeleton };
