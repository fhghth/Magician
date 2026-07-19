import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { Codicon } from '@/components/ui/codicon';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { formatCombo } from '@/lib/keybinds/combo';
import { cn } from '@/lib/utils';
import { $bindings } from '@/store/keybinds';
import { setTerminalTakeover } from '../store';
import { $activeTerminalId, $terminals, closeAllTerminals, closeOtherTerminals, closeTerminal, createTerminal, selectTerminal } from './terminals';
const RAIL_ACTION = 'grid size-6 place-items-center rounded text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [-webkit-app-region:no-drag]';
/** Tooltip label with a trailing hotkey hint (the user's live binding). */
function hintLabel(text, combo) {
    return combo ? (_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { children: text }), _jsx("span", { className: "opacity-55", children: formatCombo(combo) })] })) : (text);
}
/** Thin icon "bookmark" strip blended into the terminal surface, shown whenever a
 *  terminal exists. Each square is a tab (name + hotkey on hover); close via the
 *  shell's `exit`, middle-click, or the context menu. */
export function TerminalRail() {
    const { t } = useI18n();
    const terminals = useStore($terminals);
    const activeId = useStore($activeTerminalId);
    const bindings = useStore($bindings);
    const toggleHint = bindings['view.showTerminal']?.[0];
    const newHint = bindings['view.newTerminal']?.[0];
    return (_jsxs("div", { className: "group/rail relative z-40 flex h-full w-9 shrink-0 flex-col items-center border-l border-(--ui-stroke-quaternary) bg-(--ui-editor-surface-background)", "data-suppress-pane-reveal": "", children: [_jsxs("ul", { "aria-label": t.rightSidebar.terminalsAria, className: "flex min-h-0 flex-1 flex-col items-center gap-0.5 self-stretch overflow-y-auto overflow-x-hidden overscroll-contain py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", role: "tablist", children: [terminals.map((term, index) => (_jsx(TerminalRailItem, { active: term.id === activeId, canCloseOthers: terminals.length > 1, index: index, term: term, toggleHint: toggleHint }, term.id))), _jsx("li", { className: "flex w-full justify-center", children: _jsx(Tip, { label: hintLabel(t.rightSidebar.terminalNew, newHint), side: "left", children: _jsx("button", { "aria-label": t.rightSidebar.terminalNew, className: cn(RAIL_ACTION, 'size-7 text-(--ui-text-quaternary)'), onClick: () => createTerminal(), type: "button", children: _jsx(Codicon, { name: "add", size: "0.8125rem" }) }) }) })] }), _jsx("div", { className: "flex shrink-0 flex-col items-center pb-1.5", children: _jsx(Tip, { label: t.rightSidebar.terminalHide, side: "left", children: _jsx("button", { "aria-label": t.rightSidebar.terminalHide, className: cn(RAIL_ACTION, 'opacity-0 transition-opacity group-hover/rail:opacity-100'), onClick: () => setTerminalTakeover(false), type: "button", children: _jsx(Codicon, { name: "chevron-down", size: "0.8125rem" }) }) }) })] }));
}
function TerminalRailItem({ active, canCloseOthers, index, term, toggleHint }) {
    const { t } = useI18n();
    const label = `${index + 1}. ${term.title}`;
    return (_jsxs(ContextMenu, { children: [_jsx(ContextMenuTrigger, { asChild: true, children: _jsxs("li", { className: "relative flex w-full justify-center [-webkit-app-region:no-drag]", children: [active && (_jsx("span", { "aria-hidden": "true", className: "absolute inset-y-0.5 right-0 w-0.5 rounded-l-sm bg-(--ui-stroke-primary)" })), _jsx(Tip, { label: hintLabel(label, toggleHint), side: "left", children: _jsx("button", { "aria-label": label, "aria-selected": active, className: cn('grid size-7 place-items-center rounded-md transition-colors', active
                                    ? 'bg-(--chrome-action-hover) text-foreground'
                                    : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'), onAuxClick: event => {
                                    if (event.button === 1) {
                                        event.preventDefault();
                                        closeTerminal(term.id);
                                    }
                                }, onClick: () => selectTerminal(term.id), onMouseDown: event => {
                                    if (event.button === 1) {
                                        event.preventDefault();
                                    }
                                }, role: "tab", type: "button", children: _jsx(Codicon, { className: cn(term.kind === 'agent' && !active && 'text-primary'), name: term.kind === 'agent' ? 'agent' : 'terminal', size: "0.875rem" }) }) })] }) }), _jsxs(ContextMenuContent, { children: [_jsx(ContextMenuItem, { onSelect: () => closeTerminal(term.id), children: t.common.close }), _jsx(ContextMenuItem, { disabled: !canCloseOthers, onSelect: () => closeOtherTerminals(term.id), children: t.rightSidebar.terminalCloseOthers }), _jsx(ContextMenuItem, { onSelect: closeAllTerminals, children: t.rightSidebar.terminalCloseAll }), _jsx(ContextMenuSeparator, {}), _jsx(ContextMenuItem, { onSelect: () => setTerminalTakeover(false), children: t.rightSidebar.terminalHide })] })] }));
}
