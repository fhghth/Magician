import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { SIDEBAR_LEAD_ICON_SIZE, SidebarRowBody, SidebarRowCluster, SidebarRowGrab, SidebarRowLabel, SidebarRowLead, SidebarRowLeadGlyph, SidebarRowLink, SidebarRowNest, SidebarRowShell } from '../chrome';
import { latestProjectSessions, PROJECT_PREVIEW_COUNT, useWorkspaceNodeOpen } from './model';
import { ProjectMenu } from './project-menu';
import { WorkspaceAddButton } from './workspace-header';
// A bare color dot (no icon) or an icon glyph — tinted by `color` when set, else
// the lead's default tertiary. The glyph wrapper centers + caps size either way.
export function projectIcon({ color, icon }) {
    if (color && !icon) {
        return (_jsx(SidebarRowLeadGlyph, { children: _jsx("span", { "aria-hidden": "true", className: "size-1 rounded-full", style: { backgroundColor: color } }) }));
    }
    return (_jsx(SidebarRowLeadGlyph, { style: color ? { color } : undefined, children: _jsx(Codicon, { name: icon || 'folder-library', size: SIDEBAR_LEAD_ICON_SIZE }) }));
}
export function ProjectBackRow({ label, onClick }) {
    return (_jsx(SidebarRowShell, { children: _jsxs(SidebarRowBody, { className: "group/back w-full text-(--ui-text-tertiary) opacity-40 hover:text-foreground", onClick: onClick, children: [_jsx(SidebarRowLead, { children: _jsx(SidebarRowLeadGlyph, { children: _jsx(Codicon, { name: "arrow-left", size: SIDEBAR_LEAD_ICON_SIZE }) }) }), _jsx(SidebarRowLabel, { className: "text-xs underline-offset-4 group-hover/back:underline", children: label })] }) }));
}
export function ProjectOverviewRow({ project, onEnter, onNewSession, renderRows, activeProjectId, previewSessions, reorderable = false, dragging = false, dragHandleProps, ref, style }) {
    const { t } = useI18n();
    const s = t.sidebar;
    const isActive = project.id === activeProjectId;
    const [open, toggleOpen] = useWorkspaceNodeOpen(project.id);
    // The appearance popover anchors here (the full row) so it opens flush with
    // the sidebar's content edge regardless of which side the sidebar is on.
    const rowRef = useRef(null);
    const fetched = (previewSessions ?? []).slice(0, PROJECT_PREVIEW_COUNT);
    const preview = renderRows ? (fetched.length ? fetched : latestProjectSessions(project, PROJECT_PREVIEW_COUNT)) : [];
    const lead = reorderable ? (_jsx(SidebarRowGrab, { ariaLabel: s.projects.reorder(project.label), dragging: dragging, dragHandleProps: dragHandleProps, leadClassName: "overflow-visible", children: projectIcon(project) })) : (_jsx(SidebarRowLead, { children: projectIcon(project) }));
    return (_jsxs("div", { className: cn(dragging && 'relative z-10'), ref: ref, style: style, children: [_jsx(SidebarRowShell, { actions: _jsxs(_Fragment, { children: [onNewSession && (_jsx(WorkspaceAddButton, { label: s.newSessionIn(project.label), onClick: () => onNewSession(project.path) })), _jsx(ProjectMenu, { anchorRef: rowRef, isActive: isActive, project: project })] }), className: cn('group/workspace', dragging && 'cursor-grabbing bg-(--ui-sidebar-surface-background)'), ref: rowRef, children: _jsxs(SidebarRowCluster, { className: "min-w-0 flex-1", children: [lead, _jsx(SidebarRowLink, { "aria-label": s.projects.enter(project.label), labelClassName: cn('hover:text-foreground hover:underline', isActive && 'text-foreground'), onClick: () => onEnter?.(project.id), children: project.label }), preview.length > 0 ? (_jsx("button", { "aria-label": s.projects.toggle(project.label), className: "flex flex-1 items-center self-stretch bg-transparent p-0", onClick: toggleOpen, type: "button", children: _jsx(DisclosureCaret, { className: "shrink-0 text-(--ui-text-tertiary) opacity-0 transition group-hover/workspace:opacity-100", open: open }) })) : (_jsx("span", { className: "flex-1" }))] }) }), open && preview.length > 0 && _jsx(SidebarRowNest, { children: renderRows?.(preview) })] }));
}
