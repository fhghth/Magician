import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, memo } from 'react';
import { openAgentTerminal } from '@/app/right-sidebar/terminal/terminals';
import { StatusRow } from '@/components/chat/status-row';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { capitalize } from '@/lib/text';
import { cn } from '@/lib/utils';
const toolLabel = (name) => name.split('_').filter(Boolean).map(capitalize).join(' ') || name;
// Todo rows speak checkbox, not spinner-and-dot: a dashed ring while the item
// is still open (pending), codicons once it resolves, a live spinner only on
// the in-progress item.
const TODO_GLYPHS = {
    cancelled: { icon: 'circle-slash', tone: 'text-muted-foreground/45' },
    completed: { icon: 'pass-filled', tone: 'text-emerald-500/80' }
};
// Left slot: braille spinner while running, otherwise a small status dot
// (green = done, red = failed) so the slot is always filled and rows align.
function leadingGlyph(item, s) {
    if (item.todoStatus === 'pending') {
        return (_jsx("span", { "aria-hidden": true, className: "box-border size-[0.7rem] rounded-full border border-dashed border-muted-foreground/60" }));
    }
    if (item.todoStatus && item.todoStatus !== 'in_progress') {
        const glyph = TODO_GLYPHS[item.todoStatus];
        return _jsx(Codicon, { className: glyph.tone, name: glyph.icon, size: "0.8rem" });
    }
    if (item.state === 'running') {
        return (_jsx(GlyphSpinner, { ariaLabel: s.running, className: "text-[0.85rem] leading-none text-muted-foreground/80", spinner: "braille" }));
    }
    return (_jsx("span", { "aria-hidden": true, className: cn('size-1.5 rounded-full', item.state === 'failed' ? 'bg-destructive/80' : 'bg-emerald-500/70') }));
}
/**
 * Renders one {@link ComposerStatusItem} into the shared {@link StatusRow}.
 * Memoised + keyed by id so parent re-renders never remount it (the spinner
 * keeps ticking instead of resetting).
 */
export const StatusItemRow = memo(function StatusItemRow({ item, onDismiss, onOpen, onStop }) {
    const { t } = useI18n();
    const s = t.statusStack;
    const failed = item.state === 'failed';
    const running = item.state === 'running';
    const action = item.type === 'background'
        ? running
            ? onStop && { label: s.stop, onClick: () => onStop(item.id) }
            : onDismiss && { label: s.dismiss, onClick: () => onDismiss(item.id) }
        : null;
    const canOpen = item.type === 'subagent' && !!onOpen;
    // Background rows link to their read-only terminal tab; subagents open their session.
    const onActivate = item.type === 'background' ? () => openAgentTerminal(item.id, item.title) : canOpen ? onOpen : undefined;
    return (_jsx(Fragment, { children: _jsxs(StatusRow, { leading: leadingGlyph(item, s), onActivate: onActivate, trailing: action ? (_jsx(Tip, { label: action.label, children: _jsx(Button, { "aria-label": action.label, className: "-my-1 size-4 rounded-md text-muted-foreground/60 hover:text-foreground/90", onClick: event => {
                        event.stopPropagation();
                        action.onClick();
                    }, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.75rem" }) }) })) : canOpen ? (_jsx(Codicon, { "aria-hidden": true, className: "text-muted-foreground/55", name: "link-external", size: "0.85rem" })) : undefined, children: [_jsx("span", { className: cn('min-w-0 max-w-[18rem] truncate text-[0.73rem] leading-4', failed
                        ? 'text-destructive/90'
                        : item.todoStatus && item.todoStatus !== 'in_progress'
                            ? 'text-muted-foreground/75'
                            : 'text-foreground/92'), children: item.title }), item.type === 'subagent' && item.currentTool && (_jsx("span", { className: "shrink-0 truncate text-[0.62rem] leading-4 text-muted-foreground/70", children: toolLabel(item.currentTool) })), failed && typeof item.exitCode === 'number' && item.exitCode !== 0 && (_jsx("span", { className: "shrink-0 rounded bg-destructive/15 px-1 text-[0.58rem] font-semibold text-destructive tabular-nums", children: s.exit(item.exitCode) }))] }) }));
});
