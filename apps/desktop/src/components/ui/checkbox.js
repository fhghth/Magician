import { jsx as _jsx } from "react/jsx-runtime";
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Codicon } from '@/components/ui/codicon';
import { cn } from '@/lib/utils';
function Checkbox({ className, ...props }) {
    return (_jsx(CheckboxPrimitive.Root, { className: cn('peer size-4 shrink-0 rounded-sm border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40', className), "data-slot": "checkbox", ...props, children: _jsx(CheckboxPrimitive.Indicator, { className: "flex items-center justify-center text-current", "data-slot": "checkbox-indicator", children: _jsx(Codicon, { name: "check", size: "0.875rem" }) }) }));
}
export { Checkbox };
