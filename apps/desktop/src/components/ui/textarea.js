import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
import { controlVariants } from './control';
function Textarea({ className, size, ...props }) {
    return (_jsx("textarea", { 
        // Off by default for every consumer — these are code/config/prompt fields,
        // not prose. Callers can re-enable per-instance by passing the prop.
        autoCapitalize: "off", autoComplete: "off", autoCorrect: "off", className: cn(controlVariants({ size }), 'min-h-16', className), "data-slot": "textarea", spellCheck: false, ...props }));
}
export { Textarea };
