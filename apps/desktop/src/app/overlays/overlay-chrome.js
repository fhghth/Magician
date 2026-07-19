import { jsx as _jsx } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// Overlay chrome icon action — same titlebar-sized ghost button as the overlay
// close (X), so footer/header actions read identically across breakpoints.
export function OverlayIconButton({ children, className, type = 'button', ...props }) {
    return (_jsx(Button, { className: cn('text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground', className), size: "icon-titlebar", type: type, variant: "ghost", ...props, children: children }));
}
