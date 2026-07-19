import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CodeEditor } from '@/components/chat/code-editor';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { ColorSwatches } from '@/components/ui/color-swatches';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getProfileSoul, updateProfileSoul } from '@/hermes';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { PROFILE_SWATCHES, profileColorSoft, resolveProfileColor } from '@/lib/profile-color';
import { cn } from '@/lib/utils';
import { notify, notifyError } from '@/store/notifications';
import { $activeGatewayProfile, $profileColors, $profileCreateRequest, $profileOrder, $profiles, $profileScope, ALL_PROFILES, normalizeProfileKey, refreshActiveProfile, selectProfile, setProfileColor, setProfileOrder, setShowAllProfiles, sortByProfileOrder } from '@/store/profile';
import { CreateProfileDialog } from '../../profiles/create-profile-dialog';
import { DeleteProfileDialog } from '../../profiles/delete-profile-dialog';
import { RenameProfileDialog } from '../../profiles/rename-profile-dialog';
import { PROFILES_ROUTE } from '../../routes';
const RAIL_GAP = 4; // px — matches gap-1 between squares.
// Past this many profiles the strip of colored squares stops scaling (tiny
// drag targets, endless horizontal scroll), so the rail collapses to a compact
// select. Drag-reorder and long-press-recolor live only on the squares path.
const PROFILE_DROPDOWN_THRESHOLD = 13;
// easeOutBack — a little overshoot so squares spring into their new slot rather
// than sliding in flat. Neighbors reflow on RAIL_TRANSITION; the dragged square
// glides between snapped cells on the snappier DRAG_TRANSITION.
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const RAIL_TRANSITION = { duration: 300, easing: SPRING };
const DRAG_TRANSITION = `transform 200ms ${SPRING}`;
// The rail is a single horizontal strip of fixed cells. Pin drags to the x-axis
// (no cross-axis scrollbar), snap to whole cells so a square steps slot-to-slot
// instead of gliding, and clamp to the occupied strip so it can't float past the
// last profile onto the "+".
const stepThroughCells = ({ containerNodeRect, draggingNodeRect, transform }) => {
    if (!draggingNodeRect || !containerNodeRect) {
        return { ...transform, y: 0 };
    }
    const pitch = draggingNodeRect.width + RAIL_GAP;
    const minX = containerNodeRect.left - draggingNodeRect.left;
    const maxX = containerNodeRect.right - draggingNodeRect.right;
    const snapped = Math.round(transform.x / pitch) * pitch;
    return { ...transform, x: Math.min(maxX, Math.max(minX, snapped)), y: 0 };
};
// Arc-Spaces-style profile rail at the sidebar foot: a default↔all toggle pinned
// left, the colored named profiles scrolling between, and Manage pinned right.
// The active profile pops in its own color — the "where am I" cue. Single-
// profile users see the "+" (create their first profile) and the Manage
// overflow (edit the default profile's SOUL.md); the colored named squares
// and the default↔all toggle only appear once a second profile exists.
export function ProfileRail() {
    const { t } = useI18n();
    const p = t.profiles;
    const profiles = useStore($profiles);
    const scope = useStore($profileScope);
    const gatewayProfile = useStore($activeGatewayProfile);
    const order = useStore($profileOrder);
    const colors = useStore($profileColors);
    const navigate = useNavigate();
    const [createOpen, setCreateOpen] = useState(false);
    const [pendingRename, setPendingRename] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [pendingSoul, setPendingSoul] = useState(null);
    const scrollRef = useRef(null);
    // Too many profiles for the square strip → collapse to the select. Declared
    // ahead of the wheel effect, which re-binds when the strip mounts/unmounts.
    const condensed = profiles.length > PROFILE_DROPDOWN_THRESHOLD;
    // A plain mouse wheel only emits deltaY; map it to horizontal scroll so the
    // rail is navigable without a trackpad. Trackpad x-scroll (deltaX) passes
    // through. Native + non-passive so we can preventDefault and not bleed the
    // gesture into the sessions list above.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const onWheel = (event) => {
            if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                return;
            }
            el.scrollLeft += event.deltaY;
            event.preventDefault();
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
        // `condensed` swaps the strip out for the dropdown (ref goes null/back).
    }, [condensed]);
    const isAll = scope === ALL_PROFILES;
    const activeKey = normalizeProfileKey(gatewayProfile);
    const defaultProfile = profiles.find(profile => profile.is_default);
    const onDefault = !isAll && activeKey === 'default';
    const named = sortByProfileOrder(profiles.filter(profile => !profile.is_default), order);
    const multiProfile = profiles.length > 1;
    // distance constraint: a small drag reorders, a tap still selects the profile.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    // Tick a haptic each time the drag crosses into a new cell, and a satisfying
    // confirm on a committed reorder.
    const lastOverRef = useRef(null);
    const handleDragStart = ({ active }) => {
        lastOverRef.current = String(active.id);
    };
    const handleDragOver = ({ over }) => {
        const id = over ? String(over.id) : null;
        if (id && id !== lastOverRef.current) {
            lastOverRef.current = id;
            triggerHaptic('selection');
        }
    };
    const handleDragEnd = ({ active, over }) => {
        lastOverRef.current = null;
        if (!over || active.id === over.id) {
            return;
        }
        const ids = named.map(profile => profile.name);
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) {
            setProfileOrder(arrayMove(ids, from, to));
            triggerHaptic('success');
        }
    };
    // Re-pull the running profile + list on mount so a profile created elsewhere
    // shows up; cheap and best-effort.
    useEffect(() => {
        void refreshActiveProfile();
    }, []);
    // Open the create dialog when the `profile.create` hotkey fires (the dialog
    // state lives here, so the global keybind bumps a request atom we watch).
    const createRequest = useStore($profileCreateRequest);
    const lastCreateRef = useRef(createRequest);
    useEffect(() => {
        if (createRequest === lastCreateRef.current) {
            return;
        }
        lastCreateRef.current = createRequest;
        setCreateOpen(true);
    }, [createRequest]);
    return (_jsxs("div", { "aria-label": "Profiles", className: "flex items-center gap-0.5", "data-slot": "profile-rail", role: "tablist", children: [multiProfile &&
                (defaultProfile ? (_jsx(ProfilePill, { active: isAll || onDefault, glyph: isAll ? 'layers' : 'home', label: onDefault ? p.showAllProfiles : p.switchToProfile(defaultProfile.name), onSelect: () => (onDefault ? setShowAllProfiles(true) : selectProfile(defaultProfile.name)) })) : (_jsx(ProfilePill, { active: isAll, glyph: "layers", label: p.allProfiles, onSelect: () => setShowAllProfiles(true) }))), !multiProfile && defaultProfile && (_jsx(ProfilePill, { active: true, glyph: "home", label: defaultProfile.name, onSelect: () => selectProfile(defaultProfile.name) })), condensed ? (_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1", children: [_jsx(ProfileDropdown, { activeKey: isAll ? null : activeKey, colors: colors, onSelect: selectProfile, profiles: named }), _jsx(AddProfileButton, { label: p.newProfile, onClick: () => setCreateOpen(true) })] })) : (_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", ref: scrollRef, children: [multiProfile && (_jsx(DndContext, { collisionDetection: closestCenter, modifiers: [stepThroughCells], onDragEnd: handleDragEnd, onDragOver: handleDragOver, onDragStart: handleDragStart, sensors: sensors, children: _jsx(SortableContext, { items: named.map(profile => profile.name), strategy: horizontalListSortingStrategy, children: _jsx("div", { className: "relative flex items-center gap-1", children: named.map(profile => (_jsx(ProfileSquare, { active: !isAll && normalizeProfileKey(profile.name) === activeKey, color: resolveProfileColor(profile.name, colors), label: profile.name, onDelete: () => setPendingDelete(profile), onEditSoul: () => setPendingSoul(profile.name), onRecolor: color => setProfileColor(profile.name, color), onRename: () => setPendingRename(profile), onSelect: () => selectProfile(profile.name) }, profile.name))) }) }) })), _jsx(AddProfileButton, { label: p.newProfile, onClick: () => setCreateOpen(true) })] })), _jsx(ProfilePill, { active: false, glyph: "ellipsis", label: p.manageProfiles, onSelect: () => navigate(PROFILES_ROUTE) }), _jsx(CreateProfileDialog, { onClose: () => setCreateOpen(false), onCreated: async (name) => {
                    await refreshActiveProfile();
                    selectProfile(name);
                }, open: createOpen, profiles: profiles }), _jsx(RenameProfileDialog, { currentName: pendingRename?.name ?? '', onClose: () => setPendingRename(null), onRenamed: refreshActiveProfile, open: pendingRename !== null }), _jsx(DeleteProfileDialog, { onClose: () => setPendingDelete(null), onDeleted: refreshActiveProfile, open: pendingDelete !== null, profile: pendingDelete }), _jsx(EditSoulDialog, { onClose: () => setPendingSoul(null), profileName: pendingSoul })] }));
}
// Right-click → Edit SOUL.md for a sidebar profile — the same in-app markdown
// editor as the memory-graph node edit, so a profile's persona is editable
// without opening the Manage overlay.
function EditSoulDialog({ onClose, profileName }) {
    const { t } = useI18n();
    const p = t.profiles;
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!profileName) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setContent('');
        getProfileSoul(profileName)
            .then(soul => !cancelled && setContent(soul.content))
            .catch(err => !cancelled && notifyError(err, p.failedLoadSoul))
            .finally(() => !cancelled && setLoading(false));
        return () => void (cancelled = true);
    }, [p, profileName]);
    const save = async () => {
        if (!profileName) {
            return;
        }
        setSaving(true);
        try {
            await updateProfileSoul(profileName, content);
            notify({ kind: 'success', title: p.soulSaved, message: profileName });
            onClose();
        }
        catch (err) {
            notifyError(err, p.failedSaveSoul);
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx(Dialog, { onOpenChange: open => !open && !saving && onClose(), open: profileName !== null, children: _jsxs(DialogContent, { className: "max-w-2xl", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: [profileName, " \u00B7 SOUL.md"] }) }), _jsx("div", { className: "h-80", children: !loading && profileName && (_jsx(CodeEditor, { filePath: "SOUL.md", framed: true, initialValue: content, onCancel: () => !saving && onClose(), onChange: setContent, onSave: () => void save() }, profileName)) }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: saving, onClick: onClose, type: "button", variant: "ghost", children: t.common.cancel }), _jsx(Button, { disabled: saving || loading, onClick: () => void save(), children: saving ? p.saving : p.saveSoul })] })] }) }));
}
// The "+" create button, shared by both rail render paths.
function AddProfileButton({ label, onClick }) {
    return (_jsx(Tip, { label: label, children: _jsx("button", { "aria-label": label, className: "grid size-5 shrink-0 place-items-center rounded-[3px] text-(--ui-text-tertiary) opacity-55 transition hover:bg-(--ui-control-hover-background) hover:text-foreground hover:opacity-100", onClick: onClick, type: "button", children: _jsx(Codicon, { name: "add", size: "0.75rem" }) }) }));
}
// The condensed rail: every named profile in one compact select. The trigger
// shows the active profile (tinted initial + name); on default/all scope it
// falls back to the placeholder since the left toggle pill carries that state.
function ProfileDropdown({ activeKey, colors, onSelect, profiles }) {
    const { t } = useI18n();
    const p = t.profiles;
    const value = activeKey ? (profiles.find(profile => normalizeProfileKey(profile.name) === activeKey)?.name ?? '') : '';
    return (_jsxs(Select, { onValueChange: name => name && onSelect(name), value: value, children: [_jsx(SelectTrigger, { "aria-label": p.title, className: "min-w-0 flex-1", size: "xs", children: _jsx(SelectValue, { placeholder: p.title }) }), _jsx(SelectContent, { collisionPadding: { bottom: 44, left: 8, right: 8, top: 8 }, side: "top", children: profiles.map(profile => {
                    const color = resolveProfileColor(profile.name, colors);
                    const hue = color ?? 'var(--ui-text-quaternary)';
                    return (_jsx(SelectItem, { value: profile.name, children: _jsxs("span", { className: "flex min-w-0 items-center gap-1.5", children: [_jsx("span", { "aria-hidden": "true", className: "grid size-4 shrink-0 place-items-center rounded-[3px] text-[0.5rem] font-semibold uppercase leading-none", style: { backgroundColor: profileColorSoft(hue, 22), color: color ?? undefined }, children: profile.name.replace(/[^a-z0-9]/gi, '').charAt(0) || '?' }), _jsx("span", { className: "truncate", children: profile.name })] }) }, profile.name));
                }) })] }));
}
function ProfilePill({ active, glyph, label, onSelect }) {
    return (_jsx(Tip, { label: label, children: _jsx(Button, { "aria-label": label, "aria-pressed": active, className: cn('bg-transparent text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground', active && 'bg-(--ui-control-active-background) text-foreground'), onClick: onSelect, size: "icon-xs", type: "button", variant: "ghost", children: _jsx(Codicon, { name: glyph, size: "0.875rem" }) }) }));
}
// Hold this long without moving (a drag would have started first) to open the
// color picker — the "hard press" gesture, distinct from tap-to-select.
const LONG_PRESS_MS = 450;
// A profile *is* its colored square — no icon-button chrome. Soft profile-tint
// fill + the initial in the full color; the active one pops to full opacity with
// a color ring. These pack tightly so the rail reads as a strip of profiles,
// drag-sort to reorder (a tap below the drag threshold still selects), and
// right-click to rename/delete. The button carries both the tooltip and
// context-menu triggers via nested asChild Slots, so a single element keeps the
// dnd listeners, hover tip, and right-click menu.
function ProfileSquare({ active, color, label, onDelete, onEditSoul, onRecolor, onRename, onSelect }) {
    const { t } = useI18n();
    const p = t.profiles;
    const hue = color ?? 'var(--ui-text-quaternary)';
    const [pickerOpen, setPickerOpen] = useState(false);
    const pressTimer = useRef(null);
    const suppressClick = useRef(false);
    const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
        id: label,
        transition: RAIL_TRANSITION
    });
    const clearPress = () => {
        if (pressTimer.current != null) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };
    // A real drag (movement past the dnd threshold) cancels the pending hold, so a
    // reorder never doubles as a color pick. Also tidy up on unmount.
    useEffect(() => {
        if (isDragging) {
            clearPress();
        }
    }, [isDragging]);
    useEffect(() => clearPress, []);
    const base = CSS.Transform.toString(transform);
    const ring = active ? `inset 0 0 0 1.5px ${hue}` : '';
    const lift = isDragging ? '0 6px 16px -4px rgb(0 0 0 / 0.4)' : '';
    const pickColor = (next) => {
        onRecolor(next);
        setPickerOpen(false);
        triggerHaptic('selection');
    };
    return (_jsxs(Popover, { onOpenChange: setPickerOpen, open: pickerOpen, children: [_jsxs(ContextMenu, { children: [_jsx(TooltipProvider, { delayDuration: 0, children: _jsxs(Tooltip, { children: [_jsx(PopoverAnchor, { asChild: true, children: _jsx(ContextMenuTrigger, { asChild: true, children: _jsx(TooltipTrigger, { asChild: true, children: _jsx("button", { className: cn('grid size-5 shrink-0 cursor-grab touch-none select-none place-items-center rounded-[3px] text-[0.5625rem] font-semibold uppercase leading-none transition-opacity hover:opacity-100', active ? 'opacity-100' : 'opacity-55', isDragging && 'z-10 cursor-grabbing opacity-100'), ref: setNodeRef, style: {
                                                    backgroundColor: profileColorSoft(hue, active ? 30 : 22),
                                                    boxShadow: [ring, lift].filter(Boolean).join(', ') || undefined,
                                                    color: color ?? undefined,
                                                    // Glide the dragged square between snapped cells with a little
                                                    // overshoot (no scale — the overflow-x strip would clip it).
                                                    transform: base,
                                                    transition: isDragging ? DRAG_TRANSITION : transition
                                                }, type: "button", ...attributes, ...listeners, "aria-label": label, "aria-pressed": active, 
                                                // Hold-to-recolor rides alongside the dnd pointer listener (call
                                                // it first so drag tracking still arms), then a timer opens the
                                                // picker and flags the trailing click so it doesn't also select.
                                                onClick: () => {
                                                    if (suppressClick.current) {
                                                        suppressClick.current = false;
                                                        return;
                                                    }
                                                    onSelect();
                                                }, onPointerCancel: clearPress, onPointerDown: event => {
                                                    listeners?.onPointerDown?.(event);
                                                    if (event.button !== 0) {
                                                        return;
                                                    }
                                                    suppressClick.current = false;
                                                    clearPress();
                                                    pressTimer.current = window.setTimeout(() => {
                                                        suppressClick.current = true;
                                                        triggerHaptic('success');
                                                        setPickerOpen(true);
                                                    }, LONG_PRESS_MS);
                                                }, onPointerLeave: clearPress, onPointerUp: clearPress, children: label.replace(/[^a-z0-9]/gi, '').charAt(0) || '?' }) }) }) }), _jsx(TooltipContent, { children: label })] }) }), _jsxs(ContextMenuContent, { "aria-label": p.actionsFor(label), className: "w-40", collisionPadding: { bottom: 44, left: 8, right: 8, top: 8 }, 
                        // Menu close refocuses the trigger — which doubles as the popover
                        // anchor — so the picker reads it as focus-outside and dies on open.
                        // Suppress the refocus and the picker survives.
                        onCloseAutoFocus: event => event.preventDefault(), children: [_jsxs(ContextMenuItem, { onSelect: () => setPickerOpen(true), children: [_jsx(Codicon, { name: "symbol-color", size: "0.875rem" }), _jsx("span", { children: p.color })] }), _jsxs(ContextMenuItem, { onSelect: onRename, children: [_jsx(Codicon, { name: "text-size", size: "0.875rem" }), _jsx("span", { children: p.renameMenu })] }), _jsxs(ContextMenuItem, { onSelect: onEditSoul, children: [_jsx(Codicon, { name: "edit", size: "0.875rem" }), _jsx("span", { children: p.editSoul })] }), _jsxs(ContextMenuItem, { className: "text-destructive focus:text-destructive", onSelect: onDelete, variant: "destructive", children: [_jsx(Codicon, { name: "trash", size: "0.875rem" }), _jsx("span", { children: t.common.delete })] })] })] }), _jsx(PopoverContent, { "aria-label": p.colorFor(label), className: "w-auto p-2", collisionPadding: { bottom: 44, left: 8, right: 8, top: 8 }, side: "top", children: _jsx(ColorSwatches, { clearIcon: "sync", clearLabel: p.autoColor, onChange: pickColor, swatches: PROFILE_SWATCHES, swatchLabel: p.setColor, value: color }) })] }));
}
