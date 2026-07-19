import { jsx as _jsx } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { Square } from '@/lib/icons';
import { cn } from '@/lib/utils';
/** The sparkle "generate with AI" affordance — icon + tooltip, shared by the
 *  commit-message box and the new-project idea field so they stay one pattern.
 *  Sparkle → click generates; with `onCancel`, a Stop square appears mid-run;
 *  without it, the sparkle spins until the one-shot resolves. */
export function GenerateButton({ generating, onGenerate, onCancel, label, generatingLabel, disabled, iconSize = 12, className, ...rest }) {
    const tip = generating ? (generatingLabel ?? label) : label;
    const cancellable = generating && !!onCancel;
    return (_jsx(Tip, { label: tip, children: _jsx(Button, { "aria-label": tip, className: cn('text-muted-foreground/80 hover:text-foreground', className), disabled: generating ? !onCancel : disabled, onClick: cancellable ? onCancel : onGenerate, size: "icon-xs", type: "button", variant: "ghost", ...rest, children: cancellable ? (_jsx(Square, { className: "fill-current", size: 11 })) : (_jsx(Codicon, { name: "sparkle", size: iconSize, spinning: generating })) }) }));
}
