import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { Kbd, KbdCombo } from '@/components/ui/kbd';
import { useI18n } from '@/i18n';
import { KEYBIND_ACTIONS, KEYBIND_CATEGORIES, KEYBIND_PANEL_ACTION, KEYBIND_READONLY } from '@/lib/keybinds/actions';
import { formatCombo } from '@/lib/keybinds/combo';
import { arraysEqual } from '@/lib/storage';
import { $bindings, $capture, $keybindPanelOpen, beginCapture, closeKeybindPanel, conflictsFor, endCapture, resetAllBindings, resetBinding } from '@/store/keybinds';
// The full hotkey map. Quiet popover, click a row's chip to rebind.
export function KeybindPanel() {
    const { t } = useI18n();
    const open = useStore($keybindPanelOpen);
    const bindings = useStore($bindings);
    const k = t.keybinds;
    const [collapsed, setCollapsed] = useState(new Set());
    const openCombo = bindings[KEYBIND_PANEL_ACTION]?.[0];
    const toggleCategory = (category) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(category)) {
            next.delete(category);
        }
        else {
            next.add(category);
        }
        return next;
    });
    return (_jsx(DialogPrimitive.Root, { onOpenChange: next => !next && closeKeybindPanel(), open: open, children: _jsxs(DialogPrimitive.Portal, { children: [_jsx(DialogPrimitive.Overlay, { className: "fixed inset-0 z-[200] bg-black/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" }), _jsxs(DialogPrimitive.Content, { "aria-describedby": undefined, className: "fixed left-1/2 top-[9vh] z-[210] flex max-h-[82vh] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) shadow-nous duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", children: [_jsxs("div", { className: "flex items-center justify-between gap-3 border-b border-(--ui-stroke-tertiary) px-4 py-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx(DialogPrimitive.Title, { className: "text-sm font-semibold text-foreground", children: k.title }), _jsx(DialogPrimitive.Description, { className: "mt-0.5 text-[0.72rem] text-muted-foreground", children: k.subtitle(openCombo ? formatCombo(openCombo) : '') })] }), _jsx(HeaderButton, { icon: "discard", label: k.resetAll, onClick: resetAllBindings })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-2 py-1.5", children: KEYBIND_CATEGORIES.map(category => {
                                const actions = KEYBIND_ACTIONS.filter(action => action.category === category && action.id !== KEYBIND_PANEL_ACTION);
                                const readonly = KEYBIND_READONLY.filter(shortcut => shortcut.category === category);
                                if (actions.length === 0 && readonly.length === 0) {
                                    return null;
                                }
                                const sectionOpen = !collapsed.has(category);
                                return (_jsxs("section", { children: [_jsx(CategoryHeader, { label: k.categories[category] ?? category, onToggle: () => toggleCategory(category), open: sectionOpen }), sectionOpen && actions.map(action => _jsx(KeybindRow, { action: action }, action.id)), sectionOpen && readonly.map(shortcut => _jsx(ReadonlyRow, { shortcut: shortcut }, shortcut.id))] }, category));
                            }) })] })] }) }));
}
// Collapsible category header — chevron fades in on hover, rotates when open
// (matches the sessions sidebar section pattern).
function CategoryHeader({ label, onToggle, open }) {
    return (_jsxs("button", { className: "group/kbd-cat flex w-fit items-center gap-1 px-2.5 pb-1 pt-3 text-left leading-none", onClick: onToggle, type: "button", children: [_jsx("span", { className: "text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70", children: label }), _jsx(DisclosureCaret, { className: "text-(--ui-text-tertiary) opacity-0 transition group-hover/kbd-cat:opacity-100", open: open, size: "0.6875rem" })] }));
}
function HeaderButton({ icon, label, onClick }) {
    return (_jsxs(Button, { className: "shrink-0 text-[0.72rem]", onClick: onClick, size: "xs", variant: "text", children: [_jsx(Codicon, { name: icon, size: "0.8125rem" }), label] }));
}
function KeybindRow({ action }) {
    const { t } = useI18n();
    const k = t.keybinds;
    const bindings = useStore($bindings);
    const capture = useStore($capture);
    const combos = bindings[action.id] ?? [];
    const capturing = capture === action.id;
    const label = k.actions[action.id] ?? action.id;
    const isDefault = arraysEqual(combos, [...action.defaults]);
    const conflict = combos
        .flatMap(combo => conflictsFor(action.id, combo).map(other => k.actions[other] ?? other))
        .find(Boolean);
    return (_jsxs("div", { className: "group flex items-center gap-2.5 rounded-lg px-2.5 py-1 transition-colors hover:bg-(--chrome-action-hover)", children: [_jsx("span", { className: "min-w-0 flex-1 truncate text-[0.82rem] text-foreground/90", children: label }), conflict && (_jsx("span", { className: "flex size-4 items-center justify-center text-amber-500/90", title: k.conflictWith(conflict), children: _jsx(Codicon, { name: "warning", size: "0.8125rem" }) })), _jsx("button", { "aria-label": k.rebind, className: "flex shrink-0 items-center gap-1 rounded-lg outline-none", onClick: () => (capturing ? endCapture() : beginCapture(action.id)), title: k.rebind, type: "button", children: capturing ? (_jsx(Kbd, { variant: "capturing", children: k.pressKey })) : combos.length > 0 ? (combos.map(combo => _jsx(KbdCombo, { combo: combo }, combo))) : (_jsx(Kbd, { variant: "ghost", children: k.set })) }), isDefault ? (_jsx("span", { "aria-hidden": true, className: "size-6 shrink-0" })) : (_jsx("button", { "aria-label": k.reset, className: "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 opacity-0 transition-all hover:bg-(--ui-control-active-background) hover:text-foreground group-hover:opacity-100", onClick: () => resetBinding(action.id), title: k.reset, type: "button", children: _jsx(Codicon, { name: "discard", size: "0.8125rem" }) }))] }));
}
// Fixed shortcut: same layout as KeybindRow but the caps aren't interactive and
// the trailing reset slot stays empty (spacer keeps the columns aligned).
function ReadonlyRow({ shortcut }) {
    const { t } = useI18n();
    const k = t.keybinds;
    const label = k.actions[shortcut.id] ?? shortcut.id;
    return (_jsxs("div", { className: "flex items-center gap-2.5 rounded-lg px-2.5 py-1", children: [_jsx("span", { className: "min-w-0 flex-1 truncate text-[0.82rem] text-foreground/75", children: label }), _jsx("div", { className: "flex shrink-0 items-center gap-1", children: shortcut.keys.map(key => (_jsx(KbdCombo, { combo: key }, key))) }), _jsx("span", { "aria-hidden": true, className: "size-6 shrink-0" })] }));
}
