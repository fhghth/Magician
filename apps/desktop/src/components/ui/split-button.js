import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Codicon } from '@/components/ui/codicon';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
/**
 * A primary action fused to a caret that opens alternates — VS Code's
 * Commit / Commit & Push pattern. The primary button runs `value`; picking a
 * menu item runs it AND makes it the new default, so the control adapts to how
 * the user works without a separate settings toggle.
 */
export function SplitButton({ actions, value, onValueChange, onTrigger, disabled, className, primaryIcon, variant = 'secondary', size = 'sm' }) {
    const active = actions.find(action => action.id === value) ?? actions[0];
    if (!active) {
        return null;
    }
    return (_jsxs("div", { className: cn('inline-flex min-w-0', className), children: [_jsxs(Button, { className: "min-w-0 flex-1 rounded-r-none", disabled: disabled, onClick: () => onTrigger(active.id), size: size, variant: variant, children: [primaryIcon ?? active.icon, _jsx("span", { className: "truncate", children: active.label })] }), _jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": "More actions", className: "rounded-l-none border-l border-current/25 px-2", disabled: disabled, size: size, variant: variant, children: _jsx(Codicon, { name: "chevron-down", size: "0.8rem" }) }) }), _jsx(DropdownMenuContent, { align: "end", className: "min-w-44", children: actions.map(action => (_jsxs(DropdownMenuItem, { onSelect: () => {
                                onValueChange(action.id);
                                onTrigger(action.id);
                            }, children: [action.icon, _jsx("span", { className: "flex-1 truncate", children: action.label }), action.id === value && _jsx(Codicon, { className: "text-(--ui-text-tertiary)", name: "check", size: "0.75rem" })] }, action.id))) })] })] }));
}
