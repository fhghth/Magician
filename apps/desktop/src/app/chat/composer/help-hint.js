import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { KbdCombo } from '@/components/ui/kbd';
import { useI18n } from '@/i18n';
import { COMPLETION_DRAWER_CLASS } from './completion-drawer';
const COMMON_COMMAND_KEYS = ['/help', '/clear', '/resume', '/details', '/copy', '/quit'];
/** Stable ids → i18n `hotkeyDescs` keys. Combos resolve mod labels per OS. */
const COMPOSER_HOTKEY_ROWS = [
    { id: 'composer.mention', combos: ['@'] },
    { id: 'composer.slash', combos: ['/'] },
    { id: 'composer.help', combos: ['?'] },
    { id: 'composer.sendNewline', combos: ['enter', 'shift+enter'] },
    { id: 'composer.sendQueued', combos: ['mod+shift+k'] },
    { id: 'keybinds.openPanel', combos: ['mod+/'] },
    { id: 'composer.cancel', combos: ['escape'] },
    { id: 'composer.history', combos: ['up', 'down'] }
];
export function HelpHint() {
    const { t } = useI18n();
    const c = t.composer;
    return (_jsxs("div", { className: COMPLETION_DRAWER_CLASS, "data-slot": "composer-completion-drawer", "data-state": "open", role: "dialog", children: [_jsx(Section, { title: c.commonCommands, children: COMMON_COMMAND_KEYS.map(key => (_jsx(Row, { description: c.commandDescs[key] ?? '', keyLabel: key, mono: true }, key))) }), _jsx(Section, { title: c.hotkeys, children: COMPOSER_HOTKEY_ROWS.map(row => (_jsx(HotkeyRow, { combos: [...row.combos], description: c.hotkeyDescs[row.id] ?? '' }, row.id))) }), _jsxs("p", { className: "px-2.5 py-1 text-xs text-muted-foreground/80", children: [_jsx("span", { className: "font-mono text-foreground/80", children: "/help" }), " ", c.helpFooter] })] }));
}
function Section({ children, title }) {
    return (_jsxs("div", { className: "grid gap-0.5 pt-0.5", children: [_jsx("p", { className: "px-2.5 pb-0.5 pt-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground/75", children: title }), children] }));
}
function Row({ description, keyLabel, mono = false }) {
    return (_jsxs("div", { className: "flex min-w-0 items-baseline gap-2 rounded-md px-2.5 py-1 text-xs", children: [_jsx("span", { className: mono ? 'shrink-0 truncate font-mono font-medium text-foreground/85' : 'shrink-0 truncate text-foreground/85', children: keyLabel }), _jsx("span", { className: "min-w-0 truncate text-muted-foreground/80", children: description })] }));
}
function HotkeyRow({ combos, description }) {
    return (_jsxs("div", { className: "flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1 text-xs", children: [_jsx("span", { className: "flex shrink-0 items-center gap-1", children: combos.map(combo => (_jsx(KbdCombo, { combo: combo, size: "sm" }, combo))) }), _jsx("span", { className: "min-w-0 truncate text-muted-foreground/80", children: description })] }));
}
