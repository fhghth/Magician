import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PixelEggSprite } from '@/components/pet/pixel-egg-sprite';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { PawPrint } from '@/lib/icons';
import { selectableCardClass } from '@/lib/selectable-card';
import { cn } from '@/lib/utils';
const VARIANT_COUNT = 4;
export function DraftGrid({ drafts, generating, hasDrafts, onCancel, onHatch, onRemix, onSelect, selected }) {
    const { t } = useI18n();
    const copy = t.commandCenter.generatePet;
    const slots = generating
        ? Array.from({ length: VARIANT_COUNT }, (_, i) => drafts.find(draft => draft.index === i) ?? null)
        : drafts;
    return (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex items-center justify-between text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: [_jsx("span", { className: cn(generating && 'shimmer shimmer-color-primary opacity-40', !generating && 'invisible'), children: copy.generating }), _jsxs("span", { className: "tabular-nums", children: [Math.min(drafts.length, VARIANT_COUNT), "/", VARIANT_COUNT] })] }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: slots.map((draft, i) => {
                    // A streamed draft is selectable immediately — even mid-generation —
                    // so the user can commit to one without waiting for the rest.
                    const isSelected = draft != null && selected === draft.index;
                    return (_jsxs("div", { className: "group relative aspect-[192/208]", children: [_jsx("button", { className: cn('absolute inset-0 flex items-center justify-center overflow-hidden', selectableCardClass({ active: isSelected, prominent: true })), disabled: draft == null, onClick: () => draft != null && onSelect(draft.index), type: "button", children: draft != null ? (_jsx("img", { alt: "", className: "pet-reveal size-full object-contain p-1.5", draggable: false, src: draft.dataUri })) : (_jsxs("div", { className: "relative z-10 flex flex-col items-center", children: [_jsx(PixelEggSprite, { index: i, mode: "bounce", size: 48 }), _jsx("span", { className: "pet-egg-shadow pet-egg-shadow--sm", style: { marginTop: '-0.3rem' } })] })) }), draft != null && !generating && (_jsx(Tip, { label: copy.remix, children: _jsx(Button, { "aria-label": copy.remix, className: cn('absolute right-1 top-1 z-20', 'text-(--ui-text-tertiary) opacity-10 transition', 'hover:bg-transparent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100'), onClick: event => {
                                        event.stopPropagation();
                                        onRemix(draft);
                                    }, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Codicon, { name: "git-branch", size: 12 }) }) }))] }, draft ? `draft-${draft.index}` : `slot-${i}`));
                }) }), _jsx(Button, { className: "self-center", onClick: onCancel, size: "xs", variant: "text", children: t.common.cancel }), hasDrafts && (_jsxs(Button, { className: "w-full", disabled: selected === null, onClick: onHatch, children: [_jsx(PawPrint, {}), copy.hatch] }))] }));
}
