import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { COMPLETION_DRAWER_BELOW_CLASS, COMPLETION_DRAWER_CLASS, CompletionDrawerEmpty } from './completion-drawer';
const AT_ICON_BY_TYPE = {
    diff: 'diff',
    file: 'book',
    folder: 'folder',
    git: 'git-branch',
    image: 'file-media',
    simple: 'symbol-misc',
    staged: 'diff-added',
    tool: 'tools',
    url: 'globe'
};
function atIcon(item) {
    const meta = item.metadata;
    const raw = meta?.rawText || item.label;
    if (raw.startsWith('@diff')) {
        return AT_ICON_BY_TYPE.diff;
    }
    if (raw.startsWith('@staged')) {
        return AT_ICON_BY_TYPE.staged;
    }
    return AT_ICON_BY_TYPE[item.type] || AT_ICON_BY_TYPE.simple;
}
const ROW_BASE_CLASS = [
    'relative flex w-full cursor-default select-none rounded-md px-2 py-1 text-left',
    'outline-hidden transition-colors hover:bg-(--ui-bg-tertiary)',
    'data-[highlighted]:bg-(--ui-bg-tertiary) data-[highlighted]:text-foreground'
].join(' ');
export function ComposerTriggerPopover({ activeIndex, items, kind, loading, onHover, onPick, placement = 'top' }) {
    const { t } = useI18n();
    const copy = t.composer;
    const isSlash = kind === '/';
    let lastGroup;
    return (_jsx("div", { className: placement === 'bottom' ? COMPLETION_DRAWER_BELOW_CLASS : COMPLETION_DRAWER_CLASS, "data-slot": "composer-completion-drawer", "data-state": "open", onMouseDown: event => event.preventDefault(), role: "listbox", children: items.length === 0 ? (loading ? (_jsxs("div", { className: "flex items-center gap-2 px-2 py-1.5 text-(--ui-text-tertiary)", children: [_jsx(GlyphSpinner, { ariaLabel: copy.lookupLoading, className: "text-foreground/70", spinner: "braille" }), _jsx("span", { children: copy.lookupLoading })] })) : (_jsx(CompletionDrawerEmpty, { title: copy.lookupNoMatches, children: kind === '@' ? (_jsxs(_Fragment, { children: [copy.lookupTry, " ", _jsx("span", { className: "font-mono text-foreground/80", children: "@file:" }), " ", copy.lookupOr, ' ', _jsx("span", { className: "font-mono text-foreground/80", children: "@folder:" }), "."] })) : (_jsxs(_Fragment, { children: [copy.lookupTry, " ", _jsx("span", { className: "font-mono text-foreground/80", children: "/help" }), "."] })) }))) : (items.map((item, index) => {
            const meta = item.metadata;
            const display = meta?.display ?? (isSlash ? `/${item.label}` : item.label);
            const description = meta?.meta || item.description;
            const group = meta?.group?.trim();
            const showHeader = isSlash && Boolean(group) && group !== lastGroup;
            const isFirstHeader = lastGroup === undefined;
            lastGroup = group || lastGroup;
            const active = index === activeIndex;
            return (_jsxs(Fragment, { children: [showHeader && (_jsx("div", { className: cn('select-none px-2 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)', isFirstHeader ? 'pt-0.5' : 'pt-2'), children: group })), _jsx("button", { className: cn(ROW_BASE_CLASS, isSlash ? 'flex-col gap-0' : 'items-center gap-2'), "data-highlighted": active ? '' : undefined, onClick: () => onPick(item), onMouseEnter: () => onHover(index), type: "button", children: isSlash ? (_jsxs(_Fragment, { children: [_jsx("span", { className: cn('font-medium leading-snug text-foreground', active ? 'whitespace-normal break-words' : 'truncate'), children: display }), description && (_jsx("span", { className: cn('leading-snug text-(--ui-text-tertiary)', active ? 'whitespace-normal break-words' : 'truncate'), children: description }))] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "grid size-4 shrink-0 place-items-center text-(--ui-text-tertiary)", children: _jsx(Codicon, { name: atIcon(item), size: "0.875rem" }) }), _jsx("span", { className: "min-w-0 shrink truncate font-mono font-medium leading-5 text-foreground", children: display }), description && (_jsx("span", { className: "min-w-0 flex-1 truncate leading-5 text-(--ui-text-tertiary)", children: description }))] })) })] }, item.id));
        })) }));
}
