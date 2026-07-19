import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
function ScrollArea({ className, children, ...props }) {
    return (_jsxs(ScrollAreaPrimitive.Root, { className: cn('relative overflow-hidden', className), "data-slot": "scroll-area", ...props, children: [_jsx(ScrollAreaPrimitive.Viewport, { className: "size-full outline-none", "data-slot": "scroll-area-viewport", children: children }), _jsx(ScrollBar, {}), _jsx(ScrollAreaPrimitive.Corner, {})] }));
}
function ScrollBar({ className, orientation = 'vertical', ...props }) {
    return (_jsx(ScrollAreaPrimitive.ScrollAreaScrollbar, { className: cn('flex touch-none select-none p-px transition-colors', orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent', orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent', className), "data-slot": "scroll-area-scrollbar", orientation: orientation, ...props, children: _jsx(ScrollAreaPrimitive.ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/45", "data-slot": "scroll-area-thumb" }) }));
}
export { ScrollArea, ScrollBar };
