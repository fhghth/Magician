import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useSyncExternalStore } from 'react';
import { NotificationStack } from '@/components/notifications';
import { PaneShell } from '@/components/pane-shell';
import { FloatingPet } from '@/components/pet/floating-pet';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { $fileBrowserOpen, $panesFlipped, $sidebarOpen, FILE_BROWSER_DEFAULT_WIDTH, FILE_BROWSER_PANE_ID, setSidebarOpen } from '@/store/layout';
import { $paneWidthOverride } from '@/store/panes';
import { $connection } from '@/store/session';
import { isSecondaryWindow } from '@/store/windows';
import { SIDEBAR_COLLAPSE_MEDIA_QUERY } from '../layout-constants';
import { useWindowControlsOverlayWidth } from './hooks/use-window-controls-overlay-width';
import { KeybindPanel } from './keybind-panel';
import { StatusbarControls } from './statusbar-controls';
import { TITLEBAR_HEIGHT, titlebarControlsPosition } from './titlebar';
import { TitlebarControls } from './titlebar-controls';
// Renderer-side fallback so layout snaps even when the main-process fullscreen event
// hasn't landed yet (e.g. dev reloads, before the IPC bridge is wired).
function subscribeWindowSize(cb) {
    window.addEventListener('resize', cb);
    window.addEventListener('fullscreenchange', cb);
    return () => {
        window.removeEventListener('resize', cb);
        window.removeEventListener('fullscreenchange', cb);
    };
}
const viewportIsFullscreen = () => window.innerWidth >= window.screen.width && window.innerHeight >= window.screen.height;
export function AppShell({ children, leftStatusbarItems, leftTitlebarTools, mainOverlays, onOpenSettings, overlays, previewPaneOpen = false, statusbarItems, terminalPaneOpen = false, titlebarTools }) {
    const sidebarOpen = useStore($sidebarOpen);
    const fileBrowserOpen = useStore($fileBrowserOpen);
    const panesFlipped = useStore($panesFlipped);
    const narrowViewport = useMediaQuery(SIDEBAR_COLLAPSE_MEDIA_QUERY);
    const fileBrowserWidthOverride = useStore($paneWidthOverride(FILE_BROWSER_PANE_ID));
    const connection = useStore($connection);
    const viewportFullscreen = useSyncExternalStore(subscribeWindowSize, viewportIsFullscreen, () => false);
    const isFullscreen = Boolean(connection?.isFullscreen) || viewportFullscreen;
    // Every secondary window (new-session scratch, subagent watch, cmd-click
    // pop-out) is a compact side panel — none of them carry the full titlebar
    // tool cluster. Gate on isSecondaryWindow, never the narrower new-session flag.
    const hideTitlebarControls = isSecondaryWindow();
    const titlebarControls = titlebarControlsPosition(connection?.windowButtonPosition, isFullscreen);
    // Width Windows/WSLg reserve for the native min/max/close overlay (zero on
    // macOS, where window controls sit on the left and are reported via
    // windowButtonPosition instead). The right tool cluster has to clear them.
    // Prefer the EXACT width measured from the live Window Controls Overlay
    // (precise + self-correcting across DPI/host themes); fall back to the static
    // reservation the main process sends when the WCO API isn't available.
    const measuredOverlayWidth = useWindowControlsOverlayWidth();
    const staticOverlayWidth = connection?.nativeOverlayWidth ?? 0;
    const nativeOverlayWidth = measuredOverlayWidth ?? staticOverlayWidth;
    const titlebarToolsRight = nativeOverlayWidth > 0 ? `${nativeOverlayWidth}px` : '0.75rem';
    // When the native window controls overlay our titlebar band — Windows and
    // WSLg both paint Electron's Window Controls Overlay and report
    // nativeOverlayWidth > 0 — the right rail's editor-style tab strip (which
    // normally lives IN that band) would render at y=0 under the fixed titlebar
    // tool cluster and collide with it. Drop the right rail one titlebar-height so
    // it opens BELOW the band. macOS / plain Linux paint no overlay → 0 inset,
    // layout byte-for-byte unchanged. Consumed as --right-rail-top-inset.
    const rightRailTopInset = nativeOverlayWidth > 0 ? 'var(--titlebar-height)' : '0px';
    // The inset clears the top-left titlebar buttons when nothing covers the
    // window's left edge. Default layout: the sessions sidebar sits there.
    // Flipped layout: the file browser does instead. Both force-collapse to a
    // hover-reveal overlay (0px track) below the collapse breakpoint, so the edge
    // is uncovered there regardless of their stored open state. A standalone
    // session window renders no sidebar at all, so its edge is always uncovered.
    const collapsibleLeftPaneOpen = panesFlipped ? fileBrowserOpen : sidebarOpen;
    // The terminal + preview rails never force-collapse, so when they're the
    // leftmost open pane (flipped layout) they cover the edge even when narrow.
    const persistentLeftPaneOpen = panesFlipped && (terminalPaneOpen || previewPaneOpen);
    const leftEdgePaneOpen = !isSecondaryWindow() && ((!narrowViewport && collapsibleLeftPaneOpen) || persistentLeftPaneOpen);
    const titlebarContentInset = leftEdgePaneOpen
        ? 0
        : titlebarControls.left + TITLEBAR_HEIGHT + Math.round(TITLEBAR_HEIGHT / 2);
    // The static system cluster (haptics, profiles, settings, right-sidebar) is
    // hardcoded in TitlebarControls. Pane-supplied tools (preview's group) render
    // in a separate cluster anchored further left.
    //
    // Width math has to include the `gap-x-1` (0.25rem) between buttons:
    // N buttons + (N - 1) inner gaps, plus one extra 0.25rem of breathing room
    // between the pane-tool cluster and the system cluster so they don't sit
    // flush against each other. Modeled as N gaps (N - 1 inner + 1 trailing)
    // to keep the formula generic for any pane-tool count.
    const SYSTEM_TOOL_COUNT = 4;
    const paneToolCount = titlebarTools?.filter(tool => !tool.hidden).length ?? 0;
    const systemToolsWidth = `calc(${SYSTEM_TOOL_COUNT} * (var(--titlebar-control-size) + 0.25rem))`;
    const fileBrowserWidth = fileBrowserWidthOverride !== undefined ? `${fileBrowserWidthOverride}px` : FILE_BROWSER_DEFAULT_WIDTH;
    // Where the pane-tool cluster's right edge sits, measured from the inner
    // titlebar padding (--titlebar-tools-right). Two anchors:
    //   - file-browser closed → flush against static cluster's left edge
    //   - file-browser open   → flush against the file-browser pane's left edge
    //                           (= preview pane's right edge)
    const previewToolbarGap = fileBrowserOpen ? fileBrowserWidth : systemToolsWidth;
    // Used by the drag region to know where the rightmost interactive element
    // ends. When pane tools are present, that's `gap + paneCount * controlSize
    // + paneCount * 0.25rem` (the leftmost button is at `tools-right + gap +
    // paneCount * (size + gap-x-1)`). Otherwise the static cluster's footprint
    // is enough.
    const titlebarToolsWidth = paneToolCount > 0
        ? `calc(${previewToolbarGap} + ${paneToolCount} * (var(--titlebar-control-size) + 0.25rem))`
        : systemToolsWidth;
    return (_jsxs(SidebarProvider, { className: "h-screen min-h-0 flex-col bg-background", onOpenChange: setSidebarOpen, open: sidebarOpen, style: {
            // Alias for shadcn <Sidebar> descendants. Resolves to the chat-sidebar
            // pane track via PaneShell's emitted --pane-chat-sidebar-width.
            '--sidebar-width': 'var(--pane-chat-sidebar-width)',
            '--titlebar-height': `${TITLEBAR_HEIGHT}px`,
            '--titlebar-content-inset': `${titlebarContentInset}px`,
            '--titlebar-controls-left': `${titlebarControls.left}px`,
            '--titlebar-controls-top': `${titlebarControls.top}px`,
            '--titlebar-tools-right': titlebarToolsRight,
            '--titlebar-tools-width': titlebarToolsWidth,
            // Drops the right rail below the titlebar band when the OS/host paints
            // window controls over it (Windows/WSLg); 0px elsewhere.
            '--right-rail-top-inset': rightRailTopInset,
            // Anchor for the pane-tool cluster's right edge in TitlebarControls.
            // Sourced from the layout store rather than the PaneShell-emitted
            // --pane-*-width vars because the titlebar is a sibling of PaneShell
            // and CSS variables resolve at the consumer's scope.
            '--shell-preview-toolbar-gap': previewToolbarGap
        }, children: [!hideTitlebarControls && (_jsx(TitlebarControls, { leftTools: leftTitlebarTools, onOpenSettings: onOpenSettings, tools: titlebarTools })), nativeOverlayWidth > 0 && (_jsx("div", { "aria-hidden": true, className: "pointer-events-none fixed right-0 top-0 z-[4] h-(--titlebar-height) w-(--titlebar-tools-right) border-b border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background)" })), _jsxs("main", { className: "relative z-3 flex min-h-0 w-full flex-1 flex-col overflow-hidden transition-none", children: [_jsxs(PaneShell, { className: "min-h-0 flex-1", children: [_jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute left-0 top-0 z-1 h-(--titlebar-height) w-(--titlebar-controls-left) [-webkit-app-region:drag]" }), _jsx("div", { "aria-hidden": "true", className: "pointer-events-none absolute top-0 z-1 h-(--titlebar-height) left-[calc(var(--titlebar-controls-left)+(var(--titlebar-control-size)*2)+0.75rem)] right-[calc(var(--titlebar-tools-right)+var(--titlebar-tools-width)+0.75rem)] [-webkit-app-region:drag]" }), children] }), mainOverlays, !isSecondaryWindow() && _jsx(StatusbarControls, { items: statusbarItems, leftItems: leftStatusbarItems })] }), overlays, _jsx(KeybindPanel, {}), _jsx(NotificationStack, {}), _jsx(FloatingPet, {})] }));
}
