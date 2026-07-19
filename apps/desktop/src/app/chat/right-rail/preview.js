import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useMemo } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tip } from '@/components/ui/tooltip';
import { translateNow, useI18n } from '@/i18n';
import { formatCombo } from '@/lib/keybinds/combo';
import { cn } from '@/lib/utils';
import { $panesFlipped, $rightRailActiveTabId, RIGHT_RAIL_PREVIEW_TAB_ID, selectRightRailTab } from '@/store/layout';
import { $filePreviewTabs, $previewReloadRequest, $previewTarget, closeOtherRightRailTabs, closeRightRail, closeRightRailTab, closeRightRailTabsToRight } from '@/store/preview';
import { $dirtyPreviewUrls } from '@/store/preview-edit';
import { PreviewPane } from './preview-pane';
export const PREVIEW_RAIL_MIN_WIDTH = '18rem';
export const PREVIEW_RAIL_MAX_WIDTH = '38rem';
const INTRINSIC = `clamp(${PREVIEW_RAIL_MIN_WIDTH}, 36vw, 32rem)`;
// Track for <Pane id="preview">. Folds the intrinsic clamp with a min-floor
// against --chat-min-width so the chat surface never gets squeezed below it.
// Subtracts the project browser width so preview yields rather than crushing
// the chat when both right-side panes are open.
export const PREVIEW_RAIL_PANE_WIDTH = `min(${INTRINSIC}, max(0rem, calc(100vw - var(--pane-chat-sidebar-width) - var(--pane-file-browser-width, 0rem) - var(--chat-min-width))))`;
function tabLabelFor(target) {
    const value = target.label || target.path || target.source || target.url;
    const tail = value.split(/[\\/]/).filter(Boolean).at(-1);
    return tail || value || translateNow('preview.tab');
}
export function ChatPreviewRail({ onRestartServer, setTitlebarToolGroup }) {
    const { t } = useI18n();
    const previewReloadRequest = useStore($previewReloadRequest);
    const activeTabId = useStore($rightRailActiveTabId);
    const panesFlipped = useStore($panesFlipped);
    const filePreviewTabs = useStore($filePreviewTabs);
    const previewTarget = useStore($previewTarget);
    const dirtyPreviewUrls = useStore($dirtyPreviewUrls);
    const tabs = useMemo(() => [
        ...(previewTarget
            ? [{ id: RIGHT_RAIL_PREVIEW_TAB_ID, label: t.preview.tab, target: previewTarget }]
            : []),
        ...filePreviewTabs.map(({ id, target }) => ({ id, label: tabLabelFor(target), target }))
    ], [filePreviewTabs, previewTarget, t.preview.tab]);
    const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0];
    useEffect(() => {
        if (activeTab && activeTab.id !== activeTabId) {
            selectRightRailTab(activeTab.id);
        }
    }, [activeTab, activeTabId]);
    if (!activeTab) {
        return null;
    }
    const isPreview = activeTab.id === RIGHT_RAIL_PREVIEW_TAB_ID;
    return (_jsxs("aside", { className: cn('relative flex h-full w-full min-w-0 flex-col overflow-hidden border-(--ui-stroke-tertiary) bg-(--ui-editor-surface-background) text-(--ui-text-tertiary)', panesFlipped ? 'border-r' : 'border-l'), 
        // Windows/WSLg paint Electron's Window Controls Overlay across our
        // titlebar band, so the editor-style tab strip (which normally sits IN that
        // band) would land under the fixed titlebar tools. --right-rail-top-inset
        // (set by AppShell only when the overlay is present) drops the rail one
        // titlebar-height so it opens below the band. 0px elsewhere → unchanged.
        style: { paddingTop: 'var(--right-rail-top-inset, 0px)' }, children: [_jsxs("div", { className: "group/rail-tabs flex h-(--titlebar-height) shrink-0 border-b border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background)", children: [_jsx("div", { className: "flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", role: "tablist", children: tabs.map((tab, index) => {
                            const active = tab.id === activeTab.id;
                            const hasOthers = tabs.length > 1;
                            const hasTabsToRight = index < tabs.length - 1;
                            const dirty = Boolean(dirtyPreviewUrls[tab.target.url]);
                            return (_jsxs(ContextMenu, { children: [_jsx(ContextMenuTrigger, { asChild: true, children: _jsxs("div", { className: cn('group/tab relative flex h-full min-w-0 max-w-48 shrink-0 items-center text-[0.6875rem] font-medium [-webkit-app-region:no-drag] last:border-r last:border-(--ui-stroke-quaternary)', active
                                                ? 'bg-(--ui-editor-surface-background) text-foreground [--tab-bg:var(--ui-editor-surface-background)]'
                                                : 'border-r border-(--ui-stroke-quaternary) text-(--ui-text-tertiary) [--tab-bg:var(--ui-sidebar-surface-background)] hover:bg-(--chrome-action-hover) hover:text-foreground'), 
                                            // Middle-click closes the tab, matching browser/IDE muscle
                                            // memory. `onMouseDown` swallows the middle-button press so
                                            // Chromium doesn't switch into autoscroll mode.
                                            onAuxClick: event => {
                                                if (event.button !== 1) {
                                                    return;
                                                }
                                                event.preventDefault();
                                                closeRightRailTab(tab.id);
                                            }, onMouseDown: event => {
                                                if (event.button === 1) {
                                                    event.preventDefault();
                                                }
                                            }, children: [active && (_jsx("span", { "aria-hidden": "true", className: "absolute inset-x-0 top-0 h-px bg-(--ui-stroke-primary)" })), _jsx(Tip, { label: tab.target.path || tab.target.url || tab.label, children: _jsx("button", { "aria-selected": active, className: "flex h-full min-w-0 max-w-full items-center overflow-hidden pl-3 pr-2 text-left outline-none", onClick: () => selectRightRailTab(tab.id), role: "tab", type: "button", children: _jsx("span", { className: "block min-w-0 truncate", children: tab.label }) }) }), _jsx("span", { "aria-hidden": "true", className: "pointer-events-none absolute inset-y-0 right-0 w-9 bg-[linear-gradient(to_right,transparent,var(--tab-bg)_55%)] opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-within/tab:opacity-100" }), dirty && (_jsx("span", { "aria-hidden": "true", className: "pointer-events-none absolute right-1.5 top-1/2 grid size-4 -translate-y-1/2 place-items-center opacity-100 transition-opacity group-hover/tab:opacity-0 group-focus-within/tab:opacity-0", children: _jsx("span", { className: "size-2 rounded-full bg-amber-500 shadow-[0_0_0_2px_var(--tab-bg),0_1px_2px_rgba(0,0,0,0.45)] dark:bg-amber-400" }) })), _jsx("button", { "aria-label": t.preview.closeTab(tab.label), className: "pointer-events-none absolute right-1.5 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-sm text-(--ui-text-tertiary) opacity-0 transition-[background-color,color,opacity] hover:bg-(--ui-bg-secondary) hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100", onClick: () => closeRightRailTab(tab.id), type: "button", children: _jsx(Codicon, { name: "close", size: "0.75rem" }) })] }) }), _jsxs(ContextMenuContent, { children: [_jsxs(ContextMenuItem, { onSelect: () => closeRightRailTab(tab.id), children: [t.common.close, _jsx("span", { className: "ml-auto pl-4 text-(--ui-text-tertiary)", children: formatCombo('mod+w') })] }), _jsx(ContextMenuItem, { disabled: !hasOthers, onSelect: () => closeOtherRightRailTabs(tab.id), children: t.preview.closeOthers }), _jsx(ContextMenuItem, { disabled: !hasTabsToRight, onSelect: () => closeRightRailTabsToRight(tab.id), children: t.preview.closeToRight }), _jsx(ContextMenuSeparator, {}), _jsx(ContextMenuItem, { onSelect: closeRightRail, children: t.preview.closeAll })] })] }, tab.id));
                        }) }), _jsx("button", { "aria-label": t.preview.closePane, className: "mr-1.5 grid size-6 shrink-0 self-center place-items-center rounded-md text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/rail-tabs:opacity-100 [-webkit-app-region:no-drag]", onClick: closeRightRail, type: "button", children: _jsx(Codicon, { name: "close", size: "0.75rem" }) })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(PreviewPane, { embedded: true, onRestartServer: isPreview ? onRestartServer : undefined, reloadRequest: previewReloadRequest, setTitlebarToolGroup: setTitlebarToolGroup, target: activeTab.target }) })] }));
}
