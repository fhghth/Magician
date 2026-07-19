import { jsx as _jsx } from "react/jsx-runtime";
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
function Tabs({ className, ...props }) {
    return _jsx(TabsPrimitive.Root, { className: cn('flex flex-col gap-2', className), "data-slot": "tabs", ...props });
}
function TabsList({ className, ...props }) {
    return (_jsx(TabsPrimitive.List, { className: cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className), "data-slot": "tabs-list", ...props }));
}
function TabsTrigger({ className, ...props }) {
    return (_jsx(TabsPrimitive.Trigger, { className: cn('inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0', className), "data-slot": "tabs-trigger", ...props }));
}
export { Tabs, TabsList, TabsTrigger };
