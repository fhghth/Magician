import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
const TONE_BG = {
    good: 'bg-primary',
    muted: 'bg-muted-foreground/40',
    warn: 'bg-amber-500',
    bad: 'bg-destructive'
};
export function StatusDot({ className, tone, ...props }) {
    return (_jsx("span", { "aria-hidden": "true", className: cn('inline-block size-1.5 rounded-full', TONE_BG[tone], className), ...props }));
}
