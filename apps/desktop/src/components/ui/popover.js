import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
function Popover({ ...props }) {
    return _jsx(PopoverPrimitive.Root, { "data-slot": "popover", ...props });
}
function PopoverTrigger({ ...props }) {
    return _jsx(PopoverPrimitive.Trigger, { "data-slot": "popover-trigger", ...props });
}
function PopoverAnchor({ ...props }) {
    return _jsx(PopoverPrimitive.Anchor, { "data-slot": "popover-anchor", ...props });
}
function PopoverContent({ align = 'center', 
// Keeps the arrow clear of the rounded corners (rounded-lg = 8px): Radix
// clamps the arrow this far from each edge and shifts the popover to
// compensate, so the arrow never jams into a corner on start/end alignment.
arrowPadding = 12, children, className, collisionPadding = 8, sideOffset = 6, ...props }) {
    return (_jsx(PopoverPrimitive.Portal, { children: _jsxs(PopoverPrimitive.Content, { align: align, arrowPadding: arrowPadding, 
            // Themed glass surface, viewport-aware (Radix flips/shifts off edges),
            // standard open/close motion. Border-only (no shadow).
            className: cn('z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-(--ui-stroke-secondary) bg-[var(--popover-surface)] p-2 text-popover-foreground backdrop-blur-md outline-hidden data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [--popover-surface:color-mix(in_srgb,var(--ui-bg-elevated)_92%,transparent)]', className), collisionPadding: collisionPadding, "data-slot": "popover-content", sideOffset: sideOffset, ...props, children: [children, _jsx(PopoverPrimitive.Arrow, { asChild: true, height: 7, width: 16, children: _jsx("span", { className: "relative block h-[7px] w-4 overflow-visible", children: _jsx("span", { className: "absolute top-0 left-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-(--ui-stroke-secondary) bg-[var(--popover-surface)] backdrop-blur-md" }) }) })] }) }));
}
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
