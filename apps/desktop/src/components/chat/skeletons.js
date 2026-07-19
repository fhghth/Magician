import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Skeleton } from '@/components/ui/skeleton';
// Shared loading skeletons for the file/git trees and diffs — quieter than a
// spinner and shaped like the content that's about to land.
const TREE_ROWS = [
    { indent: 0, width: '55%' },
    { indent: 1, width: '72%' },
    { indent: 1, width: '46%' },
    { indent: 0, width: '60%' },
    { indent: 1, width: '52%' },
    { indent: 2, width: '40%' },
    { indent: 0, width: '64%' }
];
/** Rows of icon + label bars, mimicking a file tree mid-load. */
export function TreeSkeleton() {
    return (_jsx("div", { className: "flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5", "data-slot": "tree-skeleton", children: TREE_ROWS.map((row, index) => (_jsxs("div", { className: "flex items-center gap-2", style: { paddingLeft: `${row.indent * 12}px` }, children: [_jsx(Skeleton, { className: "size-3.5 shrink-0 rounded-[3px]" }), _jsx(Skeleton, { className: "h-3", style: { width: row.width } })] }, `${index}-${row.width}`))) }));
}
const DIFF_ROWS = ['72%', '40%', '88%', '55%', '64%', '30%', '80%', '48%', '60%', '36%', '70%'];
/** Stacked line bars, mimicking a unified diff mid-load. */
export function DiffSkeleton({ style }) {
    return (_jsx("div", { className: "flex flex-col gap-1.5 px-3 py-2", "data-slot": "diff-skeleton", style: style, children: DIFF_ROWS.map((width, index) => (_jsx(Skeleton, { className: "h-3", style: { width } }, `${index}-${width}`))) }));
}
