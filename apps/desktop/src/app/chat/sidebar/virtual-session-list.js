import { createElement as _createElement } from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { sessionPinId } from '@/store/session';
import { SidebarSessionRow } from './session-row';
const ROW_ESTIMATE_PX = 28;
const OVERSCAN_ROWS = 12;
export const VirtualSessionList = ({ activeSessionId, className, entries, onArchiveSession, onBranchSession, onDeleteSession, onResumeSession, onTogglePin, pinned, sortable, workingSessionIdSet }) => {
    const scrollerRef = useRef(null);
    const virtualizer = useVirtualizer({
        count: entries.length,
        estimateSize: () => ROW_ESTIMATE_PX,
        getItemKey: index => entries[index]?.session.id ?? index,
        getScrollElement: () => scrollerRef.current,
        // jsdom-friendly default; the real rect takes over on first observe.
        initialRect: { height: 600, width: 240 },
        overscan: OVERSCAN_ROWS
    });
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const paddingTop = virtualItems[0]?.start ?? 0;
    const paddingBottom = Math.max(0, totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0));
    const rows = virtualItems.map(virtualItem => {
        const entry = entries[virtualItem.index];
        if (!entry) {
            return null;
        }
        const { branchStem, session } = entry;
        const reorderable = sortable && !branchStem;
        const commonProps = {
            branchStem,
            isPinned: pinned,
            isSelected: session.id === activeSessionId,
            isWorking: workingSessionIdSet.has(session.id),
            onArchive: () => onArchiveSession(session.id),
            onBranch: onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined,
            onDelete: () => onDeleteSession(session.id),
            onPin: () => onTogglePin(sessionPinId(session)),
            onResume: () => onResumeSession(session.id),
            reorderable
        };
        return reorderable ? (_jsx(VirtualSortableRow, { index: virtualItem.index, measureRef: virtualizer.measureElement, rowProps: commonProps, session: session }, session.id)) : (_createElement(SidebarSessionRow, { ...commonProps, "data-index": virtualItem.index, key: session.id, ref: virtualizer.measureElement, session: session }));
    });
    // When sortable, the caller wraps this in a ReorderableList that owns the
    // DndContext + SortableContext (keyed on the same ids); the virtualized rows
    // just consume that context via useSortable.
    return (_jsx("div", { className: cn('relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain', className), ref: scrollerRef, children: _jsx("div", { className: "grid gap-px", style: { paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }, children: rows }) }));
};
function VirtualSortableRow({ index, measureRef, rowProps, session }) {
    const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: session.id });
    // Merge dnd-kit's setNodeRef with the virtualizer's measureElement so
    // the row participates in both DnD hit-testing and TanStack height
    // measurement.
    const refMerged = useCallback((node) => {
        setNodeRef(node);
        measureRef(node);
    }, [measureRef, setNodeRef]);
    return (_jsx(SidebarSessionRow, { ...rowProps, "data-index": index, dragging: isDragging, dragHandleProps: { ...attributes, ...listeners }, ref: refMerged, reorderable: true, session: session, style: { transform: CSS.Transform.toString(transform), transition } }));
}
