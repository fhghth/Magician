import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RowButton } from '@/components/ui/row-button';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { $paneHeightOverride, $paneState, setPaneHeightOverride } from '@/store/panes';
// Monospace capability chip (tool name, transport, …). Shared by the Skills
// and MCP tabs so the pill reads identically everywhere.
export function ToolChip({ children, title }) {
    return (_jsx("span", { className: "rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary)", title: title, children: children }));
}
// Master–detail page scaffolding (14rem rail, p-2, centered max-w-2xl detail):
// dense uniform rows on the left, roomy inspector on the right. Shared by the
// Capabilities and Messaging pages — pages bring their own row/detail content
// (CapRow here is the toggle-row flavor; Messaging has its own avatar rows).
// `pane` docks a full-bleed work surface (editor, log viewer, terminal) below
// the whole master–detail grid — the app's bottom-pane pattern, page-local.
// The wide-rail track shared by every Capabilities tab (skills/tools/mcp) so
// the three read as one page. Exported for pages that build their own grid
// (the MCP tab's cursor-driven layout) but must stay in step.
export const MASTER_DETAIL_WIDE_COLS = 'sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]';
// `split="wide"` gives list-heavy pages a rail that shares the page with a
// sparse detail (skills/tools/mcp); the default 14rem rail suits pages whose
// detail carries the weight (messaging).
export function MasterDetail({ children, pane, split = 'rail' }) {
    return (_jsxs("div", { className: "flex h-full min-h-0 flex-col", children: [_jsx("div", { className: cn('grid min-h-0 flex-1 grid-cols-1', split === 'wide' ? MASTER_DETAIL_WIDE_COLS : 'sm:grid-cols-[14rem_minmax(0,1fr)]'), children: children }), pane] }));
}
export function ListColumn({ children, header }) {
    return (_jsxs("aside", { className: "flex min-h-0 flex-col p-2", children: [header, _jsx("div", { className: "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]", children: children })] }));
}
// `footer` pins one quiet caption below the scroll (e.g. "changes apply to
// new sessions") so per-item detail components never repeat it themselves.
// `actionBar` pins a real control row (save/toggle) below the scroll instead.
export function DetailColumn({ actionBar, children, footer }) {
    return (_jsxs("main", { className: "flex min-h-0 flex-col overflow-hidden", children: [_jsx("div", { className: "min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]", children: _jsx("div", { className: "mx-auto max-w-2xl space-y-5 px-5 py-4", children: children }) }), footer && (_jsx("div", { className: "mx-auto w-full max-w-2xl shrink-0 px-5 pb-3 pt-1.5 text-right text-[0.65rem] text-muted-foreground/50", children: footer })), actionBar && (_jsx("footer", { className: "shrink-0 bg-(--ui-chat-surface-background) px-5 py-2.5", children: _jsx("div", { className: "mx-auto flex max-w-2xl flex-wrap items-center gap-2", children: actionBar }) }))] }));
}
// Full-bleed docked bottom pane: title strip + actions + close, drag-resizable
// on its top edge like every other pane (height persisted through the same
// pane-state store the terminal uses). No min height — drag (or the chevron)
// collapses it down to just the header. Content swaps freely: JSON editor
// today, stdio/log viewers tomorrow.
const DETAIL_PANE_DEFAULT_BODY_PX = 288;
const DETAIL_PANE_MAX_VH = 0.7;
const DETAIL_PANE_COLLAPSED_PX = 4;
// Ghost icon-button on the kebab-trigger scale (pane headers, list-strip menu,
// per-server MCP actions, JSON editor format button). MUST stay a class string
// (not a CSS @utility): the leading `size-5` is what tailwind-merge uses to
// strip <Button size="icon">'s larger built-in size — a custom utility class
// isn't size-merge-aware, so Button's icon size would leak and blow it up.
// Compose extra state (data-[state=open], hover:text-destructive) with cn().
export const ICON_BUTTON = 'size-5 cursor-pointer rounded-[4px] text-muted-foreground/70 hover:bg-(--ui-control-active-background) hover:text-foreground';
export function DetailPane({ actions, children, defaultCollapsed = false, defaultHeight = DETAIL_PANE_DEFAULT_BODY_PX, id, onClose, title }) {
    const { t } = useI18n();
    const override = useStore($paneHeightOverride(id));
    useEffect(() => {
        if (defaultCollapsed && $paneState(id).get() === undefined) {
            setPaneHeightOverride(id, 0);
        }
    }, [defaultCollapsed, id]);
    const height = override ?? defaultHeight;
    const collapsed = height <= DETAIL_PANE_COLLAPSED_PX;
    // Sash drag mirrors the shell's y-axis pane resize: pointer capture on the
    // top edge, clamped to [0, 70vh]; double-click resets to the default.
    const [dragging, setDragging] = useState(false);
    const startDrag = (event) => {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = height;
        const max = Math.round(window.innerHeight * DETAIL_PANE_MAX_VH);
        setDragging(true);
        const onMove = (move) => {
            setPaneHeightOverride(id, Math.min(max, Math.max(0, Math.round(startHeight + (startY - move.clientY)))));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            setDragging(false);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
    };
    return (_jsxs("section", { className: "relative flex shrink-0 flex-col border-t border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background)", children: [_jsx("div", { className: "group/sash absolute inset-x-0 top-0 z-10 h-1 -translate-y-1/2 cursor-row-resize", onDoubleClick: () => setPaneHeightOverride(id, undefined), onPointerDown: startDrag, children: _jsx("div", { className: cn('absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors', dragging ? 'bg-(--ui-stroke-secondary)' : 'group-hover/sash:bg-(--ui-stroke-secondary)') }) }), _jsxs("header", { className: "flex h-9 shrink-0 items-center gap-2 px-3", children: [_jsx("span", { className: "min-w-0 truncate text-xs font-medium text-foreground", children: title }), _jsxs("div", { className: "ml-auto flex shrink-0 items-center gap-1.5", children: [actions, _jsx(Button, { "aria-expanded": !collapsed, "aria-label": collapsed ? t.common.expand : t.common.collapse, className: ICON_BUTTON, onClick: () => setPaneHeightOverride(id, collapsed ? undefined : 0), size: "icon", variant: "ghost", children: _jsx(Codicon, { name: collapsed ? 'chevron-up' : 'chevron-down', size: "0.8125rem" }) }), onClose && (_jsx(Button, { "aria-label": t.common.close, className: ICON_BUTTON, onClick: onClose, size: "icon", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.8125rem" }) }))] })] }), _jsx("div", { className: "min-h-0 overflow-hidden", style: { height: collapsed ? 0 : height }, children: children })] }));
}
// One-line control strip pinned above the list: sort/primary action on the
// left, overflow kebab on the right.
export function ListStrip({ left, right }) {
    return (_jsxs("div", { className: "mb-1 flex h-6 shrink-0 items-center justify-between gap-2 pl-2 pr-1", children: [_jsx("div", { className: "flex min-w-0 items-center gap-1.5", children: left }), _jsx("div", { className: "flex shrink-0 items-center gap-1.5", children: right })] }));
}
// Overflow kebab for list-wide actions. `toggle` renders as the first row —
// one label + switch line covering enable-all/disable-all (checked = every
// visible item on; mixed reads as off so one flip always means "all on").
export function ListStripMenu({ items = [], label, toggle }) {
    return (_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx(Button, { "aria-label": label, className: cn(ICON_BUTTON, 'data-[state=open]:bg-(--ui-control-active-background) data-[state=open]:text-foreground'), size: "icon", title: label, variant: "ghost", children: _jsx(Codicon, { name: "kebab-vertical", size: "0.8125rem" }) }) }), _jsxs(DropdownMenuContent, { align: "end", className: "w-44", sideOffset: 6, children: [toggle && (_jsxs(DropdownMenuItem, { disabled: toggle.disabled, onSelect: event => {
                            // Keep the menu open so the switch is seen flipping.
                            event.preventDefault();
                            toggle.onToggle(!toggle.checked);
                        }, children: [_jsx("span", { className: "min-w-0 flex-1 truncate", children: toggle.label }), _jsx(Switch, { checked: toggle.checked, className: cn('pointer-events-none shrink-0', !toggle.checked && 'opacity-60'), size: "xs", tabIndex: -1 })] })), items.map(item => (_jsx(DropdownMenuItem, { disabled: item.disabled, onSelect: item.onSelect, children: item.label }, item.label)))] })] }));
}
export function ListStripButton({ active, children, disabled, onClick }) {
    return (_jsx("button", { className: cn('cursor-pointer text-[0.68rem] font-medium transition-colors disabled:opacity-40', active ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'), disabled: disabled, onClick: onClick, type: "button", children: children }));
}
// The one row used by all three lists. Fixed height, always-visible switch —
// state reads from the switch + dimmed title, toggling never requires
// selecting first. Off rows dim; the switch itself dims when off.
export function CapRow({ active, busy, enabled, meta, onSelect, onToggle, rowId, subtitle, title, toggleLabel }) {
    return (_jsxs("div", { className: cn('group/row row-hover flex w-full shrink-0 items-center rounded-md hover:text-foreground', subtitle ? 'h-11' : 'h-8', active ? 'bg-(--ui-row-active-background) text-foreground' : 'text-(--ui-text-secondary)'), id: rowId, children: [_jsxs(RowButton, { className: "flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left", onClick: onSelect, children: [_jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: cn('block truncate text-[0.78rem]', enabled ? 'font-medium text-foreground/85' : 'font-normal text-muted-foreground/60'), children: title }), subtitle != null && (_jsx("span", { className: "flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50", children: typeof subtitle === 'string' ? _jsx("span", { className: "truncate", children: subtitle }) : subtitle }))] }), meta != null && (_jsx("span", { className: "shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums leading-3.5 text-(--ui-text-tertiary)", children: meta }))] }), _jsx(Switch, { "aria-label": toggleLabel, checked: enabled, className: cn('mr-1.5 shrink-0 cursor-pointer', !enabled && 'opacity-60'), disabled: busy, onCheckedChange: onToggle, size: "xs", title: toggleLabel })] }));
}
