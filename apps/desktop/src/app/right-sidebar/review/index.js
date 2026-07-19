import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { FileDiffPanel } from '@/components/chat/diff-lines';
import { DiffSkeleton, TreeSkeleton } from '@/components/chat/skeletons';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DiffCount } from '@/components/ui/diff-count';
import { Tip } from '@/components/ui/tooltip';
import { useDelayedTrue } from '@/hooks/use-delayed-true';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { $panesFlipped } from '@/store/layout';
import { notifyError } from '@/store/notifications';
import { $reviewDiff, $reviewDiffLoading, $reviewFiles, $reviewIsRepo, $reviewLoading, $reviewRevertTarget, $reviewSelectedPath, $reviewTreeMode, cancelRevert, clearReviewSelection, closeReview, confirmRevert, refreshReview, requestRevert, stageReviewFile, toggleReviewTreeMode, unstageReviewFile } from '@/store/review';
import { SidebarPanelLabel } from '../../shell/sidebar-label';
import { PaneEmptyState, RightSidebarSectionHeader } from '../index';
import { ReviewFileTree } from './file-tree';
import { ReviewShipBar } from './ship-bar';
// Compact header/diff action buttons — micro hit targets packed tight, matching
// the rest of the app's icon-action rows.
const ACTION_BTN = 'size-5';
export function ReviewPane() {
    const { t } = useI18n();
    const c = t.statusStack.coding;
    const panesFlipped = useStore($panesFlipped);
    const files = useStore($reviewFiles);
    const loading = useStore($reviewLoading);
    const isRepo = useStore($reviewIsRepo);
    const selectedPath = useStore($reviewSelectedPath);
    const diff = useStore($reviewDiff);
    const diffLoading = useStore($reviewDiffLoading);
    const revertTarget = useStore($reviewRevertTarget);
    const treeMode = useStore($reviewTreeMode);
    const selectedFile = files.find(file => file.path === selectedPath);
    const hasFiles = files.length > 0;
    // `{ path: null }` → revert all; `{ path: '…' }` → revert one file.
    const revertingAll = revertTarget?.path == null;
    // Delay the skeletons so fast loads (most project switches) just blank → content
    // instead of flashing a jarring loading state.
    const showTreeSkeleton = useDelayedTrue(loading && !hasFiles);
    const showDiffSkeleton = useDelayedTrue(diffLoading);
    return (_jsxs("aside", { "aria-label": c.review, className: cn('before:pointer-events-none relative flex h-full w-full min-w-0 flex-col overflow-hidden border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height) text-(--ui-text-tertiary)', panesFlipped
            ? 'border-r shadow-[inset_-0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'
            : 'border-l shadow-[inset_0.0625rem_0_0_color-mix(in_srgb,white_18%,transparent)]'), children: [(loading || isRepo) && (_jsxs(RightSidebarSectionHeader, { "data-suppress-pane-reveal-side": "", children: [_jsx("div", { className: "flex min-w-0 flex-1", children: _jsx(SidebarPanelLabel, { children: c.review }) }), _jsx(Tip, { label: treeMode === 'tree' ? c.viewAsList : c.viewAsTree, children: _jsx(Button, { "aria-label": treeMode === 'tree' ? c.viewAsList : c.viewAsTree, className: ACTION_BTN, disabled: !hasFiles, onClick: toggleReviewTreeMode, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: treeMode === 'tree' ? 'list-flat' : 'list-tree', size: "0.8125rem" }) }) }), _jsx(Tip, { label: c.stageAll, children: _jsx(Button, { "aria-label": c.stageAll, className: ACTION_BTN, disabled: !hasFiles, onClick: () => void stageReviewFile(null).catch(err => notifyError(err, c.stageAll)), size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "add", size: "0.8125rem" }) }) }), _jsx(Tip, { label: c.revertAll, children: _jsx(Button, { "aria-label": c.revertAll, className: ACTION_BTN, disabled: !hasFiles, onClick: () => requestRevert(null), size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "discard", size: "0.8125rem" }) }) }), _jsx(Tip, { label: t.rightSidebar.refreshTree, children: _jsx(Button, { "aria-label": t.rightSidebar.refreshTree, className: ACTION_BTN, onClick: () => void refreshReview(), size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "refresh", size: "0.8125rem", spinning: loading }) }) }), _jsx(Tip, { label: c.close, children: _jsx(Button, { "aria-label": c.close, className: ACTION_BTN, onClick: closeReview, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.8125rem" }) }) })] })), loading || isRepo ? (hasFiles ? (_jsx(ReviewFileTree, {})) : showTreeSkeleton ? (_jsx(TreeSkeleton, {})) : loading ? (_jsx("div", { className: "min-h-0 flex-1" })) : (_jsx(PaneEmptyState, { label: t.rightSidebar.noDiffs }))) : (_jsx(PaneEmptyState, { label: t.rightSidebar.noDiffs })), selectedFile && (_jsxs("div", { className: "flex max-h-[55%] shrink-0 flex-col border-t border-(--ui-stroke-secondary)", children: [_jsxs("div", { className: "flex items-center gap-1 px-2.5 py-1.5", "data-suppress-pane-reveal-side": "", children: [_jsx("span", { className: "min-w-0 flex-1 truncate font-mono text-[0.66rem] text-(--ui-text-secondary)", title: selectedFile.path, children: selectedFile.path }), _jsx(DiffCount, { added: selectedFile.added, className: "text-[0.64rem] leading-4", removed: selectedFile.removed }), _jsx(Tip, { label: selectedFile.staged ? c.unstage : c.stage, children: _jsx(Button, { "aria-label": selectedFile.staged ? c.unstage : c.stage, className: ACTION_BTN, onClick: () => void (selectedFile.staged ? unstageReviewFile(selectedFile.path) : stageReviewFile(selectedFile.path)).catch(err => notifyError(err, c.stage)), size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: selectedFile.staged ? 'remove' : 'add', size: "0.8rem" }) }) }), _jsx(Tip, { label: c.close, children: _jsx(Button, { "aria-label": c.close, className: ACTION_BTN, onClick: clearReviewSelection, size: "icon-xs", variant: "ghost", children: _jsx(Codicon, { name: "close", size: "0.8rem" }) }) })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-auto px-1 pb-1", children: diffLoading ? (showDiffSkeleton ? (_jsx(DiffSkeleton, {})) : null) : diff ? (_jsx(FileDiffPanel, { diff: diff, path: selectedFile.path })) : (_jsx("div", { className: "py-6 text-center text-[0.66rem] text-muted-foreground/60", children: c.noDiff })) })] })), _jsx(ReviewShipBar, {}), _jsx(Dialog, { onOpenChange: open => !open && cancelRevert(), open: revertTarget !== undefined, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: revertingAll ? c.revertAll : c.revert }), _jsxs(DialogDescription, { children: [revertingAll ? c.revertAllConfirm : c.revertConfirm, !revertingAll && revertTarget?.path && (_jsx("span", { className: "mt-2 block truncate font-mono text-[0.7rem] text-(--ui-text-secondary)", title: revertTarget.path, children: revertTarget.path }))] })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { onClick: cancelRevert, variant: "ghost", children: t.common.cancel }), _jsx(Button, { onClick: () => void confirmRevert().catch(err => notifyError(err, c.revert)), variant: "destructive", children: revertingAll ? c.revertAll : c.revert })] })] }) })] }));
}
