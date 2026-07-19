import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { ColorSwatches } from '@/components/ui/color-swatches';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useI18n } from '@/i18n';
import { PROFILE_SWATCHES } from '@/lib/profile-color';
import { cn } from '@/lib/utils';
import { $panesFlipped, dismissAutoProject } from '@/store/layout';
import { copyPath, deleteProject, openProjectAddFolder, openProjectRename, revealPath, setActiveProject, updateProject } from '@/store/projects';
// Curated codicons for the project glyph (tinted by the chosen color).
const ICONS = [
    'folder-library',
    'repo',
    'rocket',
    'beaker',
    'flame',
    'star-full',
    'heart',
    'zap',
    'target',
    'lightbulb',
    'tools',
    'device-desktop',
    'device-mobile',
    'terminal',
    'dashboard',
    'globe',
    'broadcast',
    'cloud',
    'database',
    'package',
    'book',
    'organization',
    'bug',
    'shield',
    'key',
    'gift',
    'telescope',
    'home'
];
// Per-project actions, modeled on git GUIs (GitHub Desktop / GitKraken): reveal
// in the file manager, copy path, and "Remove from sidebar" (never deletes files
// — auto projects are dismissed, explicit ones drop their entry). Explicit
// projects additionally get rename / add folder / set active. Hidden until the
// row is hovered (group/workspace), matching the + affordance.
export function ProjectMenu({ project, isActive, scoped = false, onExitScope, anchorRef }) {
    const { t } = useI18n();
    const p = t.sidebar.projects;
    const target = { id: project.id, name: project.label };
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    // Open toward the content area: right when the sidebar is on the left, left
    // when the panes are flipped (sidebar on the right).
    const panesFlipped = useStore($panesFlipped);
    const removeAuto = () => {
        dismissAutoProject(project.id);
        if (scoped) {
            onExitScope?.();
        }
    };
    const confirmDelete = async () => {
        await deleteProject(project.id);
        if (scoped) {
            onExitScope?.();
        }
    };
    const trigger = (_jsx(DropdownMenuTrigger, { asChild: true, children: _jsx("button", { "aria-label": p.menu, className: cn('grid size-4 shrink-0 place-items-center rounded-sm bg-transparent text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground data-[state=open]:opacity-100', 
            // In the project header reveal on the whole header hover; in overview
            // rows reveal on the row hover.
            scoped ? 'group-hover/section:opacity-100' : 'group-hover/workspace:opacity-100'), onClick: event => event.stopPropagation(), type: "button", children: _jsx(Codicon, { name: "kebab-vertical", size: "0.75rem" }) }) }));
    return (_jsxs(Popover, { onOpenChange: setAppearanceOpen, open: appearanceOpen, children: [anchorRef ? _jsx(PopoverAnchor, { virtualRef: anchorRef }) : null, _jsxs(DropdownMenu, { children: [anchorRef ? trigger : _jsx(PopoverAnchor, { asChild: true, children: trigger }), _jsxs(DropdownMenuContent, { align: "end", className: "w-48", onCloseAutoFocus: event => event.preventDefault(), sideOffset: 6, children: [!project.isAuto && (_jsxs(_Fragment, { children: [_jsxs(DropdownMenuItem, { onSelect: () => openProjectRename(target), children: [_jsx(Codicon, { name: "edit", size: "0.875rem" }), _jsx("span", { children: p.menuRename })] }), _jsxs(DropdownMenuItem, { onSelect: () => setAppearanceOpen(true), children: [_jsx(Codicon, { name: "symbol-color", size: "0.875rem" }), _jsx("span", { children: p.menuAppearance })] }), _jsxs(DropdownMenuItem, { onSelect: () => openProjectAddFolder(target), children: [_jsx(Codicon, { name: "new-folder", size: "0.875rem" }), _jsx("span", { children: p.menuAddFolder })] }), _jsxs(DropdownMenuItem, { disabled: isActive, onSelect: () => void setActiveProject(project.id), children: [_jsx(Codicon, { name: "target", size: "0.875rem" }), _jsx("span", { children: p.menuSetActive })] }), _jsx(DropdownMenuSeparator, {})] })), _jsxs(DropdownMenuItem, { disabled: !project.path, onSelect: () => void revealPath(project.path), children: [_jsx(Codicon, { name: "folder-opened", size: "0.875rem" }), _jsx("span", { children: p.reveal })] }), _jsxs(DropdownMenuItem, { disabled: !project.path, onSelect: () => void copyPath(project.path), children: [_jsx(Codicon, { name: "copy", size: "0.875rem" }), _jsx("span", { children: p.copyPath })] }), _jsx(DropdownMenuSeparator, {}), project.isAuto ? (_jsxs(DropdownMenuItem, { onSelect: removeAuto, variant: "destructive", children: [_jsx(Codicon, { name: "trash", size: "0.875rem" }), _jsx("span", { children: p.removeFromSidebar })] })) : (_jsxs(DropdownMenuItem, { onSelect: () => setConfirmDeleteOpen(true), variant: "destructive", children: [_jsx(Codicon, { name: "trash", size: "0.875rem" }), _jsx("span", { children: `${p.menuDelete}…` })] }))] })] }), _jsxs(PopoverContent, { align: "start", className: "w-auto p-2", onClick: event => event.stopPropagation(), side: panesFlipped ? 'left' : 'right', sideOffset: 6, children: [_jsx(ColorSwatches, { clearIcon: "circle-slash", clearLabel: p.noColor, onChange: color => void updateProject(project.id, { color }), swatches: PROFILE_SWATCHES, value: project.color ?? null }), _jsx("div", { className: "mt-2 grid grid-cols-6 gap-1.5", children: ICONS.map(name => (_jsx("button", { "aria-label": name, className: cn('grid aspect-square place-items-center rounded-md text-(--ui-text-tertiary) transition hover:bg-(--ui-control-hover-background)', project.icon === name && 'bg-(--ui-control-active-background) text-foreground'), onClick: () => void updateProject(project.id, { icon: project.icon === name ? null : name }), style: project.icon === name && project.color ? { color: project.color } : undefined, type: "button", children: _jsx(Codicon, { name: name, size: "0.8125rem" }) }, name))) })] }), _jsx(ConfirmDialog, { confirmLabel: p.menuDelete, description: p.deleteConfirm, destructive: true, onClose: () => setConfirmDeleteOpen(false), onConfirm: confirmDelete, open: confirmDeleteOpen, title: `${p.menuDelete} "${project.label}"?` })] }));
}
