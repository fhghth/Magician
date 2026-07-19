import { jsx as _jsx } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { cn } from '@/lib/utils';
// Chrome caret for collapsible sections: points right when closed (▶),
// rotates to point down (▼) when open. Override `className` to layer
// hover/opacity styling; twMerge resolves transition conflicts.
export function DisclosureCaret({ className, open, size = '0.75rem', ...props }) {
    return (_jsx(Codicon, { className: cn('transition-transform duration-150', open && 'rotate-90', className), name: "chevron-right", size: size, ...props }));
}
