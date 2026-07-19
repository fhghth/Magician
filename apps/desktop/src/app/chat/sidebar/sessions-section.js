import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { SidebarPanelLabel } from '@/app/shell/sidebar-label';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { flattenSessionsWithBranches } from '@/lib/session-branch-tree';
import { cn } from '@/lib/utils';
import { sessionPinId } from '@/store/session';
import { SidebarCount } from './chrome';
import { EnteredProjectContent, ProjectOverviewRow, SidebarWorkspaceGroup } from './projects';
import { ReorderableList, useSortableBindings } from './reorderable-list';
import { SidebarSessionSkeletons } from './section-states';
import { SidebarSessionRow } from './session-row';
import { VirtualSessionList } from './virtual-session-list';
export const VIRTUALIZE_THRESHOLD = 25;
function SidebarSectionHeader({ label, open, onToggle, action, meta, icon, collapsible = true }) {
    const labelBody = (_jsxs(_Fragment, { children: [icon, _jsx(SidebarPanelLabel, { children: label }), meta && _jsx(SidebarCount, { children: meta })] }));
    return (_jsxs("div", { className: "group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5", children: [collapsible ? (_jsxs("button", { className: "group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none", onClick: onToggle, type: "button", children: [labelBody, _jsx(DisclosureCaret, { className: "text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100", open: open })] })) : (_jsx("div", { className: "flex w-fit items-center gap-1 leading-none", children: labelBody })), action] }));
}
export function SidebarSessionsSection({ label, open, onToggle, sessions, activeSessionId, workingSessionIdSet, onResumeSession, onDeleteSession, onArchiveSession, onBranchSession, onTogglePin, onNewSessionInWorkspace, pinned, rootClassName, contentClassName, emptyState, forceEmptyState = false, headerAction, footer, groups, projectOverview, projectOverviewPreviews, projectsLoading = false, onEnterProject, projectContent, projectRepoWorktrees, liveSessions, removedSessionIds, activeProjectId, labelMeta, labelIcon, collapsible = true, sortable = false, onReorderSessions, onReorderProjects, projectBackRow, dndSensors }) {
    const sectionOpen = collapsible ? open : true;
    const hasGroupedSessions = Boolean(groups?.some(group => group.sessions.length > 0));
    // A defined project list is itself content (even an empty project should
    // render as a drill-in row so the user can see it exists).
    const hasProjectOverview = Boolean(projectOverview?.length);
    const hasProjectContent = Boolean(projectContent && projectContent.sessionCount > 0);
    const showEmptyState = forceEmptyState || (!hasGroupedSessions && !hasProjectOverview && !hasProjectContent && sessions.length === 0);
    // The flat recents/pinned list is the only place sessions reorder by hand;
    // grouped/tree views always sort by creation date and never drag.
    const sessionsDraggable = sortable && !!onReorderSessions;
    const displayEntries = useMemo(() => flattenSessionsWithBranches(sessions), [sessions]);
    const renderRow = (session, draggable, branchStem) => {
        const rowProps = {
            branchStem,
            isPinned: pinned,
            isSelected: session.id === activeSessionId,
            isWorking: workingSessionIdSet.has(session.id),
            onArchive: () => onArchiveSession(session.id),
            onBranch: onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined,
            onDelete: () => onDeleteSession(session.id),
            onPin: () => onTogglePin(sessionPinId(session)),
            onResume: () => onResumeSession(session.id),
            reorderable: draggable && !branchStem,
            session
        };
        return draggable && !branchStem ? (_jsx(SortableSidebarSessionRow, { ...rowProps }, session.id)) : (_jsx(SidebarSessionRow, { ...rowProps }, session.id));
    };
    // Sessions inside repos/worktrees are date-ordered and static.
    const renderRows = (items) => flattenSessionsWithBranches(items).map(({ branchStem, session }) => renderRow(session, false, branchStem));
    const flatVirtualized = !showEmptyState &&
        !groups?.length &&
        !projectOverview?.length &&
        !projectContent &&
        sessions.length >= VIRTUALIZE_THRESHOLD;
    // First paint into the grouped view (e.g. the app restoring the Projects tab)
    // has flat recents in `sessions` but no tree yet. Show skeletons rather than
    // flashing the flat session list until the overview/content/groups resolve. A
    // background refresh keeps the prior tree, so this only fires when empty.
    const showProjectsSkeleton = projectsLoading && !hasProjectOverview && !hasProjectContent && !projectContent && !groups?.length;
    let inner;
    if (showProjectsSkeleton) {
        inner = _jsx(SidebarSessionSkeletons, {});
    }
    else if (projectContent) {
        // Entered a project: the back row is always present, then either the
        // (overlay-aware) content or a clean empty state — never a bare spinner or a
        // blank pane while lanes hydrate.
        inner = (_jsxs(_Fragment, { children: [projectBackRow, hasProjectContent ? (_jsx(EnteredProjectContent, { liveSessions: liveSessions, onNewSession: onNewSessionInWorkspace, project: projectContent, removedSessionIds: removedSessionIds, renderRows: renderRows, repoWorktrees: projectRepoWorktrees })) : (emptyState)] }));
    }
    else if (showEmptyState) {
        inner = emptyState;
    }
    else if (projectOverview?.length) {
        // The model is already ordered (default sort groups explicit-before-auto;
        // a manual drag-order, when present, wins). Render in that order and make
        // rows drag-to-reorder when a handler is wired.
        const projectsDraggable = projectOverview.length > 1 && !!onReorderProjects;
        const Row = projectsDraggable ? SortableProjectOverviewRow : ProjectOverviewRow;
        const rows = projectOverview.map(project => (_jsx(Row, { activeProjectId: activeProjectId, onEnter: onEnterProject, onNewSession: onNewSessionInWorkspace, previewSessions: project.path ? projectOverviewPreviews?.[project.path] : undefined, project: project, renderRows: renderRows }, project.id)));
        inner =
            projectsDraggable && onReorderProjects ? (_jsx(ReorderableList, { ids: projectOverview.map(project => project.id), onReorder: onReorderProjects, sensors: dndSensors, children: rows })) : (rows);
    }
    else if (groups?.length) {
        // Profile/source groups never reorder; render them flat with static rows.
        inner = groups.map(group => (_jsx(SidebarWorkspaceGroup, { group: group, onNewSession: onNewSessionInWorkspace, renderRows: renderRows }, group.id)));
    }
    else if (flatVirtualized) {
        const virtual = (_jsx(VirtualSessionList, { activeSessionId: activeSessionId, className: contentClassName, entries: displayEntries, onArchiveSession: onArchiveSession, onBranchSession: onBranchSession, onDeleteSession: onDeleteSession, onResumeSession: onResumeSession, onTogglePin: onTogglePin, pinned: pinned, sortable: sessionsDraggable, workingSessionIdSet: workingSessionIdSet }));
        inner =
            sessionsDraggable && onReorderSessions ? (_jsx(ReorderableList, { ids: sessions.map(s => s.id), onReorder: onReorderSessions, sensors: dndSensors, children: virtual })) : (virtual);
    }
    else if (sessionsDraggable && onReorderSessions) {
        inner = (_jsx(ReorderableList, { ids: sessions.map(s => s.id), onReorder: onReorderSessions, sensors: dndSensors, children: displayEntries.map(({ branchStem, session }) => renderRow(session, true, branchStem)) }));
    }
    else {
        inner = displayEntries.map(({ branchStem, session }) => renderRow(session, false, branchStem));
    }
    // The virtualizer owns its own scroller, so suppress the wrapper's overflow
    // to avoid a double scroll container.
    const resolvedContentClassName = cn(contentClassName, flatVirtualized && 'overflow-y-visible');
    return (_jsxs(SidebarGroup, { className: rootClassName, children: [_jsx(SidebarSectionHeader, { action: headerAction, collapsible: collapsible, icon: labelIcon, label: label, meta: labelMeta, onToggle: onToggle, open: sectionOpen }), sectionOpen && (_jsxs(SidebarGroupContent, { className: resolvedContentClassName, children: [inner, footer] }))] }));
}
function SortableSidebarSessionRow(props) {
    return _jsx(SidebarSessionRow, { ...props, ...useSortableBindings(props.session.id) });
}
function SortableProjectOverviewRow(props) {
    return _jsx(ProjectOverviewRow, { ...props, ...useSortableBindings(props.project.id) });
}
