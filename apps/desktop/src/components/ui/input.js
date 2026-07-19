import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
import { controlVariants } from './control';
function Input({ className, type, size, ...props }) {
    return (_jsx("input", { 
        // Off by default for every consumer — these are code/config/search fields,
        // not prose. Callers can re-enable per-instance by passing the prop.
        autoCapitalize: "off", autoComplete: "off", autoCorrect: "off", className: cn(controlVariants({ size }), 'selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground', className), "data-slot": "input", spellCheck: false, type: type, ...props }));
}
export { Input };
