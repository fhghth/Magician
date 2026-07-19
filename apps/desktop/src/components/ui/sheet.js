'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Dialog as SheetPrimitive } from 'radix-ui';
import { Codicon } from '@/components/ui/codicon';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
function Sheet({ ...props }) {
    return _jsx(SheetPrimitive.Root, { "data-slot": "sheet", ...props });
}
function SheetTrigger({ ...props }) {
    return _jsx(SheetPrimitive.Trigger, { "data-slot": "sheet-trigger", ...props });
}
function SheetClose({ ...props }) {
    return _jsx(SheetPrimitive.Close, { "data-slot": "sheet-close", ...props });
}
function SheetPortal({ ...props }) {
    return _jsx(SheetPrimitive.Portal, { "data-slot": "sheet-portal", ...props });
}
function SheetOverlay({ className, ...props }) {
    return (_jsx(SheetPrimitive.Overlay, { className: cn('fixed inset-0 z-50 bg-black/22 backdrop-blur-[0.125rem] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0', className), "data-slot": "sheet-overlay", ...props }));
}
function SheetContent({ className, children, side = 'right', showCloseButton = true, ...props }) {
    const { t } = useI18n();
    return (_jsxs(SheetPortal, { children: [_jsx(SheetOverlay, {}), _jsxs(SheetPrimitive.Content, { className: cn('fixed z-50 flex flex-col gap-3 border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) text-[length:var(--conversation-text-font-size)] shadow-md transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500', side === 'right' &&
                    'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm', side === 'left' &&
                    'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm', side === 'top' &&
                    'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top', side === 'bottom' &&
                    'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom', className), "data-slot": "sheet-content", ...props, children: [children, showCloseButton && (_jsxs(SheetPrimitive.Close, { "aria-label": t.common.close, className: "absolute top-3 right-3 rounded-md p-1 text-(--ui-text-tertiary) opacity-70 ring-offset-background transition-opacity hover:bg-(--chrome-action-hover) hover:text-foreground hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary", children: [_jsx(Codicon, { name: "close", size: "1rem" }), _jsx("span", { className: "sr-only", children: t.common.close })] }))] })] }));
}
function SheetHeader({ className, ...props }) {
    return _jsx("div", { className: cn('flex flex-col gap-1 p-3', className), "data-slot": "sheet-header", ...props });
}
function SheetFooter({ className, ...props }) {
    return _jsx("div", { className: cn('mt-auto flex flex-col gap-2 p-3', className), "data-slot": "sheet-footer", ...props });
}
function SheetTitle({ className, ...props }) {
    return (_jsx(SheetPrimitive.Title, { className: cn('text-[0.9375rem] font-semibold text-foreground', className), "data-slot": "sheet-title", ...props }));
}
function SheetDescription({ className, ...props }) {
    return (_jsx(SheetPrimitive.Description, { className: cn('text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)', className), "data-slot": "sheet-description", ...props }));
}
export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
