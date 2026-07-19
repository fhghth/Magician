import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
export function Codicon({ className, name, size, spinning, style, ...props }) {
    return (_jsx("i", { "aria-hidden": "true", className: cn('codicon', `codicon-${name}`, spinning && 'codicon-modifier-spin', className), style: { fontSize: size, ...style }, ...props }));
}
/** Wrap a codicon as a Tabler-shaped icon for nav rows that expect `IconComponent`. */
export function codiconIcon(name) {
    function CodiconIcon({ className }) {
        return _jsx(Codicon, { "aria-hidden": true, className: cn('leading-none', className), name: name, size: "1em" });
    }
    CodiconIcon.displayName = `Codicon(${name})`;
    return CodiconIcon;
}
