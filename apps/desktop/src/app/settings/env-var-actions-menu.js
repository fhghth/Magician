import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { ExternalLink, Eye, EyeOff, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
export function EnvVarActionsMenu({ align = 'end', children, clearDisabled = false, docsUrl, isRevealed = false, isSet, label, onClear, onEdit, onReveal, showReveal = true, sideOffset = 6 }) {
    const { t } = useI18n();
    const copy = t.settings.envActions;
    const hasClear = isSet && onClear;
    const hasReveal = isSet && showReveal && onReveal;
    const hasDocs = Boolean(docsUrl?.trim());
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: children }), _jsxs(DropdownMenuContent, { align: align, "aria-label": copy.actionsFor(label), className: "w-44", sideOffset: sideOffset, children: [hasDocs && (_jsxs(DropdownMenuItem, { onSelect: event => {
                            event.preventDefault();
                            triggerHaptic('selection');
                            window.open(docsUrl, '_blank', 'noopener,noreferrer');
                        }, children: [_jsx(ExternalLink, { className: "size-3.5" }), _jsx("span", { children: copy.docs })] })), hasReveal && (_jsxs(DropdownMenuItem, { onSelect: () => {
                            triggerHaptic('selection');
                            onReveal();
                        }, children: [isRevealed ? _jsx(EyeOff, { className: "size-3.5" }) : _jsx(Eye, { className: "size-3.5" }), _jsx("span", { children: isRevealed ? copy.hideValue : copy.revealValue })] })), _jsxs(DropdownMenuItem, { onSelect: () => {
                            triggerHaptic('selection');
                            onEdit();
                        }, children: [_jsx(Codicon, { name: "edit", size: "0.875rem" }), _jsx("span", { children: isSet ? copy.replace : copy.set })] }), hasClear && (_jsxs(_Fragment, { children: [_jsx(DropdownMenuSeparator, {}), _jsxs(DropdownMenuItem, { disabled: clearDisabled, onSelect: () => {
                                    triggerHaptic('warning');
                                    onClear();
                                }, variant: "destructive", children: [_jsx(Trash2, { className: "size-3.5" }), _jsx("span", { children: copy.clear })] })] }))] })] }));
}
export function EnvVarActionsTrigger({ className, label, ...props }) {
    const { t } = useI18n();
    const copy = t.settings.envActions;
    return (_jsx(Button, { "aria-label": copy.actionsFor(label), className: cn('text-muted-foreground hover:text-foreground', className), size: "icon-sm", title: copy.credentialActions, variant: "ghost", ...props, children: _jsx(Codicon, { name: "ellipsis", size: "0.875rem" }) }));
}
