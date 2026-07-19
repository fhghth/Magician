import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '@/lib/utils';
function TextTabMeta({ className, ...props }) {
    return _jsx("span", { className: cn('text-[0.72em] font-normal text-(--ui-text-tertiary)', className), ...props });
}
function TextTab({ active = false, children, className, type = 'button', ...props }) {
    return (_jsx("button", { className: cn('group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50', active && 'text-foreground', className), "data-active": active, type: type, ...props, children: React.Children.map(children, child => React.isValidElement(child) && child.type === TextTabMeta ? (child) : (_jsx("span", { className: cn('underline-offset-4 decoration-current/25', active ? 'underline' : 'group-hover/text-tab:underline'), children: child }))) }));
}
export { TextTab, TextTabMeta };
