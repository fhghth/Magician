'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
export const TooltipIconButton = forwardRef(({ children, tooltip, side = 'bottom', className, ...rest }, ref) => {
    return (_jsx(Tip, { label: tooltip, side: side, children: _jsx(Button, { size: "icon-xs", variant: "ghost", ...rest, "aria-label": tooltip, className: cn('aui-button-icon', className), ref: ref, children: children }) }));
});
TooltipIconButton.displayName = 'TooltipIconButton';
