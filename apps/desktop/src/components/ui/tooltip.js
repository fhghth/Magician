import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
function TooltipProvider({ delayDuration = 0, ...props }) {
    return _jsx(TooltipPrimitive.Provider, { "data-slot": "tooltip-provider", delayDuration: delayDuration, ...props });
}
function Tooltip({ ...props }) {
    return _jsx(TooltipPrimitive.Root, { "data-slot": "tooltip", ...props });
}
function TooltipTrigger({ ...props }) {
    return _jsx(TooltipPrimitive.Trigger, { "data-slot": "tooltip-trigger", ...props });
}
function TooltipContent({ className, sideOffset = 6, children, ...props }) {
    return (_jsx(TooltipPrimitive.Portal, { children: _jsx(TooltipPrimitive.Content
        // Instant, no transition (the Provider's delayDuration=0 + no animate-*
        // classes). bg-foreground/text-background auto-inverts per theme: white
        // on near-black in light mode, black on white in dark.
        , { 
            // Instant, no transition (the Provider's delayDuration=0 + no animate-*
            // classes). bg-foreground/text-background auto-inverts per theme: white
            // on near-black in light mode, black on white in dark.
            className: cn('z-[200] w-fit bg-foreground px-1.5 py-1 text-[11px] font-bold leading-none text-background select-none [font-family:Arial,sans-serif]', className), "data-slot": "tooltip-content", sideOffset: sideOffset, ...props, children: children }) }));
}
// Drop-in replacement for native `title=`: wrap any single element. Instant,
// position-aware, themed. Self-contained (carries its own Provider) so it works
// anywhere without a provider ancestor. Renders the child untouched when label
// is falsy.
function Tip({ label, children, delayDuration = 0, ...props }) {
    if (!label) {
        return _jsx(_Fragment, { children: children });
    }
    return (_jsx(TooltipProvider, { delayDuration: delayDuration, children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: children }), _jsx(TooltipContent, { ...props, children: label })] }) }));
}
export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
