import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DiffCount } from '@/components/ui/diff-count';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { isDesktopFsRemoteMode } from '@/lib/desktop-fs';
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview';
import { cn } from '@/lib/utils';
import { $renamingPath, copyFilePath, revealFile, toRelativePath } from '@/store/file-actions';
import { $sidebarWorkspaceCollapsedIds, revealFileInTree, toggleWorkspaceNodeCollapsed } from '@/store/layout';
import { notifyError } from '@/store/notifications';
import { setCurrentSessionPreviewTarget } from '@/store/preview';
import { $reviewFiles, $reviewLoading, $reviewOpen, $reviewSelectedPath, $reviewTreeMode, requestRevert, selectReviewFile, stageReviewFile, unstageReviewFile } from '@/store/review';
import { $currentCwd } from '@/store/session';
import { pickRevealLabel } from '../file-actions';
import { buildReviewFlatList, buildReviewTree } from './tree-data';
const INDENT = 12;
// Per git status letter: a tinted diff codicon so the file's nature reads at a
// glance (added / modified / deleted / renamed / untracked).
const STATUS_GLYPH = {
    A: { icon: 'diff-added', tone: 'text-(--ui-green)' },
    C: { icon: 'diff-added', tone: 'text-(--ui-green)' },
    D: { icon: 'diff-removed', tone: 'text-(--ui-red)' },
    M: { icon: 'diff-modified', tone: 'text-amber-500/85' },
    R: { icon: 'diff-renamed', tone: 'text-sky-500/85' },
    U: { icon: 'warning', tone: 'text-(--ui-red)' },
    '?': { icon: 'diff-added', tone: 'text-muted-foreground/60' }
};
// Review paths are repo-relative; the composer drop expects absolute paths, so
// join against the active session cwd (the repo we probed).
function absolutePath(relative) {
    if (/^([a-zA-Z]:[\\/]|\/)/.test(relative)) {
        return relative;
    }
    const cwd = $currentCwd
        .get()
        ?.trim()
        .replace(/[\\/]+$/, '');
    return cwd ? `${cwd}/${relative}` : relative;
}
// Fast, layout-aware row: `layout` slides siblings when one is inserted/removed
// (a new file at index N pushes the rest down), AnimatePresence fades the
// enter/exit. A tight, near-critically-damped spring keeps it crisp (quick
// settle, no bounce) so adds/deletes read as snappy, not floaty.
const ROW_TRANSITION = { type: 'spring', stiffness: 1100, damping: 48, mass: 0.32 };
// Instant (no animation) — used while the pane is settling open so the initial
// batch of rows doesn't fly in.
const ROW_INSTANT = { duration: 0 };
// Past this many changed files, drop the per-row motion (AnimatePresence +
// layout springs on every node is the heaviest cost) and lean on CSS
// content-visibility so off-screen rows skip layout/paint.
const HEAVY_LIST_CAP = 60;
// Reserve a stable row height (h-6 = 1.5rem) so the scrollbar stays correct
// while off-screen rows are skipped.
const ROW_CV_STYLE = { containIntrinsicSize: 'auto 1.5rem', contentVisibility: 'auto' };
export function ReviewFileTree() {
    const files = useStore($reviewFiles);
    const open = useStore($reviewOpen);
    const loading = useStore($reviewLoading);
    const mode = useStore($reviewTreeMode);
    const tree = useMemo(() => (mode === 'tree' ? buildReviewTree(files) : buildReviewFlatList(files)), [files, mode]);
    const heavy = tree.length > HEAVY_LIST_CAP;
    // The Pane keeps this tree mounted while collapsed, so opening it doesn't
    // remount (AnimatePresence `initial={false}` can't help). The first refresh
    // after opening can also surface a batch of edits made while it was closed.
    // Suppress row enter/exit until that first post-open refresh settles; real
    // edits made while the pane stays open then animate normally.
    const [animate, setAnimate] = useState(false);
    const armed = useRef(false);
    useEffect(() => {
        if (!open) {
            armed.current = false;
            setAnimate(false);
        }
    }, [open]);
    useEffect(() => {
        if (open && !loading && !armed.current) {
            armed.current = true;
            const id = requestAnimationFrame(() => setAnimate(true));
            return () => cancelAnimationFrame(id);
        }
    }, [open, loading]);
    return (_jsx("div", { className: "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1", "data-suppress-pane-reveal-side": "", children: _jsx(ReviewNodeList, { animate: animate && !heavy, depth: 0, motion: !heavy, nodes: tree }) }));
}
function ReviewNodeList({ animate, depth, motion: useMotion, nodes }) {
    // Heavy lists: plain rows + content-visibility, no motion.
    if (!useMotion) {
        return (_jsx(_Fragment, { children: nodes.map(node => (_jsx("div", { style: ROW_CV_STYLE, children: node.isDir ? (_jsx(ReviewDirRow, { animate: false, depth: depth, motion: useMotion, node: node })) : (_jsx(ReviewFileRow, { depth: depth, node: node })) }, node.id))) }));
    }
    return (_jsx(AnimatePresence, { initial: false, children: nodes.map(node => (_jsx(motion.div, { animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -2 }, initial: animate ? { opacity: 0, y: -4 } : false, layout: "position", transition: animate ? ROW_TRANSITION : ROW_INSTANT, children: node.isDir ? (_jsx(ReviewDirRow, { animate: animate, depth: depth, motion: useMotion, node: node })) : (_jsx(ReviewFileRow, { depth: depth, node: node })) }, node.id))) }));
}
// Depth-0 rows align their icon to the panel header's dither glyph: the tree
// body has px-1 (4px) and the header glyph sits at px-2.5 (10px) + the label's
// pl-2 (8px) = 18px, so the base inset is 18 − 4 = 14px.
const ROW_BASE_INSET = 14;
function rowStyle(depth) {
    return { paddingLeft: `${depth * INDENT + ROW_BASE_INSET}px` };
}
function ReviewDirRow({ animate, depth, motion: useMotion, node }) {
    const collapsed = useStore($sidebarWorkspaceCollapsedIds);
    const id = `review:${node.id}`;
    const open = !collapsed.includes(id);
    const toggle = () => toggleWorkspaceNodeCollapsed(id);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "group/review-row row-hover flex h-6 select-none items-center gap-1.5 rounded-md pr-1.5 text-xs text-(--ui-text-secondary) hover:text-foreground", onClick: toggle, style: rowStyle(depth), children: [_jsx(Codicon, { className: "shrink-0 text-(--ui-text-tertiary)", name: open ? 'folder-opened' : 'folder', size: "0.8rem" }), _jsx("span", { className: "min-w-0 flex-1 truncate", title: node.name, children: node.name })] }), open && node.children && (_jsx(ReviewNodeList, { animate: animate, depth: depth + 1, motion: useMotion, nodes: node.children }))] }));
}
function ReviewFileRow({ node, depth }) {
    const { t } = useI18n();
    const c = t.statusStack.coding;
    const selectedPath = useStore($reviewSelectedPath);
    const file = node.file;
    const selected = file.path === selectedPath;
    const glyph = STATUS_GLYPH[file.status] ?? STATUS_GLYPH.M;
    const dragPath = absolutePath(file.path);
    const cwd = useStore($currentCwd);
    // Single-click shows the inline diff; double-click opens the file in the main
    // preview pane (matching the file browser). They're mutually exclusive: defer
    // the single-click select briefly so a double-click can cancel it, otherwise a
    // double-click would fire BOTH (inline diff + main preview = two previews).
    const clickTimer = useRef(null);
    useEffect(() => () => {
        if (clickTimer.current != null) {
            clearTimeout(clickTimer.current);
        }
    }, []);
    const handleClick = () => {
        // A file-browser rename of the same path is active → ignore the fall-through
        // click so it doesn't open the diff / steal focus from that editor.
        if ($renamingPath.get() === dragPath) {
            return;
        }
        if (clickTimer.current != null) {
            clearTimeout(clickTimer.current);
        }
        clickTimer.current = setTimeout(() => {
            clickTimer.current = null;
            void selectReviewFile(file);
        }, 200);
    };
    const openInPreview = () => {
        void (async () => {
            try {
                const preview = await normalizeOrLocalPreviewTarget(dragPath);
                if (preview) {
                    setCurrentSessionPreviewTarget(preview, 'file-browser', dragPath);
                }
            }
            catch (error) {
                notifyError(error, t.rightSidebar.previewUnavailable);
            }
        })();
    };
    const handleDoubleClick = () => {
        if (clickTimer.current != null) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
        }
        openInPreview();
    };
    return (_jsx(ReviewFileContextMenu, { cwd: cwd, dragPath: dragPath, file: file, onOpenChanges: () => void selectReviewFile(file), onOpenFile: openInPreview, children: _jsxs("div", { "aria-selected": selected, className: cn('group/review-row row-hover flex h-6 select-none items-center gap-1.5 rounded-md pr-1.5 text-xs text-(--ui-text-secondary) hover:text-foreground', selected && 'bg-(--ui-row-active-background) text-foreground'), draggable: true, onClick: handleClick, onDoubleClick: handleDoubleClick, onDragStart: event => {
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('application/x-hermes-paths', JSON.stringify([{ isDirectory: false, path: dragPath }]));
                event.dataTransfer.setData('text/plain', dragPath);
            }, style: rowStyle(depth), title: dragPath, children: [_jsx(Codicon, { className: cn('shrink-0', glyph.tone), name: glyph.icon, size: "0.8rem" }), _jsxs("span", { className: "flex min-w-0 flex-1 items-baseline gap-1.5", children: [_jsx("span", { className: "min-w-0 shrink truncate", title: node.name, children: node.name }), node.dir && (_jsx("span", { className: "min-w-0 shrink-[9999] truncate text-[0.68rem] text-(--ui-text-tertiary)", title: node.dir, children: node.dir }))] }), _jsxs("span", { className: "hidden shrink-0 items-center gap-0.5 group-hover/review-row:flex", children: [_jsx(Tip, { label: file.staged ? c.unstage : c.stage, children: _jsx(Button, { "aria-label": file.staged ? c.unstage : c.stage, className: "size-4 rounded text-muted-foreground/70 hover:text-foreground", onClick: event => {
                                    event.stopPropagation();
                                    void (file.staged ? unstageReviewFile(file.path) : stageReviewFile(file.path));
                                }, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: file.staged ? 'remove' : 'add', size: "0.7rem" }) }) }), _jsx(Tip, { label: c.revert, children: _jsx(Button, { "aria-label": c.revert, className: "size-4 rounded text-muted-foreground/70 hover:text-(--ui-red)", onClick: event => {
                                    event.stopPropagation();
                                    requestRevert(file.path);
                                }, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "discard", size: "0.7rem" }) }) })] }), _jsx(DiffCount, { added: node.added, className: "text-[0.64rem] leading-4 group-hover/review-row:hidden", removed: node.removed }), file.staged && (_jsx("span", { "aria-hidden": true, className: "size-1.5 shrink-0 rounded-full bg-(--ui-green)/70", title: c.staged }))] }) }));
}
// Git-specific right-click menu for a changed file (VS Code's SCM menu shape):
// open changes / open file, stage·unstage, discard, then reveal / copy path. No
// rename or delete here — those belong to the file browser; this tree just
// reflects the working-tree state.
function ReviewFileContextMenu({ children, cwd, dragPath, file, onOpenChanges, onOpenFile }) {
    const { t } = useI18n();
    const c = t.statusStack.coding;
    const m = t.fileMenu;
    const localFs = !isDesktopFsRemoteMode();
    return (_jsxs(ContextMenu, { children: [_jsx(ContextMenuTrigger, { asChild: true, children: children }), _jsxs(ContextMenuContent, { children: [_jsx(ContextMenuItem, { onSelect: onOpenChanges, children: c.openChanges }), _jsx(ContextMenuItem, { onSelect: onOpenFile, children: c.openFile }), _jsx(ContextMenuSeparator, {}), _jsx(ContextMenuItem, { onSelect: () => void (file.staged ? unstageReviewFile(file.path) : stageReviewFile(file.path)).catch(err => notifyError(err, file.staged ? c.unstage : c.stage)), children: file.staged ? c.unstage : c.stage }), _jsx(ContextMenuItem, { onSelect: () => requestRevert(file.path), variant: "destructive", children: c.revert }), _jsx(ContextMenuSeparator, {}), _jsx(ContextMenuItem, { onSelect: () => revealFileInTree(dragPath), children: m.revealInSidebar }), localFs && (_jsx(ContextMenuItem, { onSelect: () => void revealFile(dragPath), children: pickRevealLabel(m.revealFinder, m.revealExplorer, m.revealFileManager) })), _jsx(ContextMenuSeparator, {}), _jsx(ContextMenuItem, { onSelect: () => void copyFilePath(dragPath), children: m.copyPath }), cwd && (_jsx(ContextMenuItem, { onSelect: () => void copyFilePath(toRelativePath(dragPath, cwd)), children: m.copyRelativePath }))] })] }));
}
