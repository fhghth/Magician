import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { Codicon } from '@/components/ui/codicon';
import { cn } from '@/lib/utils';
// Shared class tokens for edge-to-edge menus (use with `p-0` content): rows go
// full-width, square, and compact so the highlight spans the whole surface.
// Reuse these instead of re-deriving per menu so every searchable/compact menu
// reads identically.
export const dropdownMenuRow = 'gap-2 rounded-none px-2.5 py-1 text-xs';
export const dropdownMenuSectionLabel = 'px-2.5 pt-1 pb-0.5 text-[0.625rem] font-medium uppercase tracking-wide';
// Keys that must reach Radix's menu handler (navigation/close). Everything else
// is a filter keystroke and is stopped so the menu's typeahead doesn't hijack it.
const DROPDOWN_NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']);
function DropdownMenu({ ...props }) {
    return _jsx(DropdownMenuPrimitive.Root, { "data-slot": "dropdown-menu", ...props });
}
function DropdownMenuPortal({ ...props }) {
    return _jsx(DropdownMenuPrimitive.Portal, { "data-slot": "dropdown-menu-portal", ...props });
}
function DropdownMenuTrigger({ ...props }) {
    return _jsx(DropdownMenuPrimitive.Trigger, { "data-slot": "dropdown-menu-trigger", ...props });
}
/**
 * Borderless filter input for a searchable dropdown. Autofocuses, keeps the
 * menu's typeahead from eating keystrokes, and still lets arrow/enter/escape
 * drive the list. Drop it in as the first child of a `DropdownMenuContent`.
 */
function DropdownMenuSearch({ className, onChange, onKeyDown, onValueChange, ...props }) {
    return (_jsx("div", { className: "px-2.5 py-1.5", "data-slot": "dropdown-menu-search", children: _jsx("input", { autoFocus: true, className: cn('h-4 w-full bg-transparent text-xs leading-none text-foreground placeholder:text-(--ui-text-tertiary) focus:outline-none', className), onChange: event => {
                onChange?.(event);
                onValueChange?.(event.target.value);
            }, onKeyDown: event => {
                if (!DROPDOWN_NAV_KEYS.has(event.key)) {
                    event.stopPropagation();
                }
                onKeyDown?.(event);
            }, type: "text", ...props }) }));
}
function DropdownMenuContent({ className, collisionPadding = 8, sideOffset = 4, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Portal, { children: _jsx(DropdownMenuPrimitive.Content
        // `dt-portal-scrollbar` reproduces the thin themed scrollbar from
        // `.scrollbar-dt` for portaled overlays (Radix renders this under
        // document.body, outside #root's scope). See styles.css.
        , { 
            // `dt-portal-scrollbar` reproduces the thin themed scrollbar from
            // `.scrollbar-dt` for portaled overlays (Radix renders this under
            // document.body, outside #root's scope). See styles.css.
            className: cn('dt-portal-scrollbar z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 text-[length:var(--conversation-text-font-size)] text-popover-foreground shadow-md backdrop-blur-md data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95', className), 
            // Keep the menu inside the viewport: Radix flips/shifts away from edges
            // (avoidCollisions defaults on); the padding stops it kissing the edge.
            collisionPadding: collisionPadding, "data-slot": "dropdown-menu-content", sideOffset: sideOffset, ...props }) }));
}
function DropdownMenuGroup({ ...props }) {
    return _jsx(DropdownMenuPrimitive.Group, { "data-slot": "dropdown-menu-group", ...props });
}
function DropdownMenuItem({ className, inset, variant = 'default', ...props }) {
    return (_jsx(DropdownMenuPrimitive.Item, { className: cn("relative flex items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none focus:bg-(--ui-control-active-background) focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-(--ui-text-tertiary) data-[variant=destructive]:*:[svg]:text-destructive!", className), "data-inset": inset, "data-slot": "dropdown-menu-item", "data-variant": variant, ...props }));
}
function DropdownMenuCheckboxItem({ className, children, checked, ...props }) {
    return (_jsxs(DropdownMenuPrimitive.CheckboxItem, { checked: checked, className: cn("relative flex items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none focus:bg-(--ui-control-active-background) focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5", className), "data-slot": "dropdown-menu-checkbox-item", ...props, children: [children, _jsx(DropdownMenuPrimitive.ItemIndicator, { className: "ml-auto flex items-center pl-2 text-foreground", children: _jsx(Codicon, { name: "check", size: "0.75rem" }) })] }));
}
function DropdownMenuRadioGroup({ ...props }) {
    return _jsx(DropdownMenuPrimitive.RadioGroup, { "data-slot": "dropdown-menu-radio-group", ...props });
}
function DropdownMenuRadioItem({ className, children, ...props }) {
    return (_jsxs(DropdownMenuPrimitive.RadioItem, { className: cn("relative flex items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none focus:bg-(--ui-control-active-background) focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5", className), "data-slot": "dropdown-menu-radio-item", ...props, children: [children, _jsx(DropdownMenuPrimitive.ItemIndicator, { className: "ml-auto flex items-center pl-2 text-foreground", children: _jsx(Codicon, { name: "check", size: "0.75rem" }) })] }));
}
function DropdownMenuLabel({ className, inset, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Label, { className: cn('px-2 py-1 text-xs font-medium text-(--ui-text-tertiary) data-[inset]:pl-7', className), "data-inset": inset, "data-slot": "dropdown-menu-label", ...props }));
}
function DropdownMenuSeparator({ className, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Separator, { className: cn('-mx-1 my-1 h-px bg-(--ui-stroke-tertiary)', className), "data-slot": "dropdown-menu-separator", ...props }));
}
function DropdownMenuShortcut({ className, ...props }) {
    return (_jsx("span", { className: cn('ml-auto text-xs tracking-widest text-muted-foreground', className), "data-slot": "dropdown-menu-shortcut", ...props }));
}
function DropdownMenuSub({ ...props }) {
    return _jsx(DropdownMenuPrimitive.Sub, { "data-slot": "dropdown-menu-sub", ...props });
}
function DropdownMenuSubTrigger({ className, inset, hideChevron = false, children, ...props }) {
    return (_jsxs(DropdownMenuPrimitive.SubTrigger, { className: cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs outline-hidden select-none focus:bg-(--ui-control-active-background) focus:text-foreground data-[inset]:pl-7 data-[state=open]:bg-(--ui-control-active-background) data-[state=open]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-(--ui-text-tertiary)", className), "data-inset": inset, "data-slot": "dropdown-menu-sub-trigger", ...props, children: [children, !hideChevron && _jsx(Codicon, { className: "ml-auto text-(--ui-text-tertiary)", name: "chevron-right", size: "1rem" })] }));
}
function DropdownMenuSubContent({ className, collisionPadding = 8, ...props }) {
    return (_jsx(DropdownMenuPrimitive.Portal, { children: _jsx(DropdownMenuPrimitive.SubContent
        // `dt-portal-scrollbar` reproduces the themed scrollbar for portaled
        // overlays (rendered under document.body). Use a fixed `max-h-80`
        // rather than the Radix available-height variable: that variable is
        // only published on Content, NOT SubContent — using it here collapses
        // the submenu to 0px height.
        , { 
            // `dt-portal-scrollbar` reproduces the themed scrollbar for portaled
            // overlays (rendered under document.body). Use a fixed `max-h-80`
            // rather than the Radix available-height variable: that variable is
            // only published on Content, NOT SubContent — using it here collapses
            // the submenu to 0px height.
            className: cn('dt-portal-scrollbar z-50 max-h-80 min-w-36 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 text-[length:var(--conversation-text-font-size)] text-popover-foreground shadow-md backdrop-blur-md data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95', className), 
            // Flip to the other side / shift vertically when near a viewport edge
            // (e.g. the status bar menu opening from the bottom-right corner) so
            // the submenu never gets clipped.
            collisionPadding: collisionPadding, "data-slot": "dropdown-menu-sub-content", ...props }) }));
}
export { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSearch, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger };
