import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
/**
 * Shared row chrome for everything in the composer status stack — status items
 * (subagents, background) AND queued prompts. Fixed height, a leading glyph
 * slot, flexible content, and a trailing actions slot that reveals on hover.
 * Hover background matches the session sidebar. Consumers fill the three slots;
 * they never re-implement the row container.
 */
export function StatusRow({ children, className, leading, onActivate, trailing, trailingVisible = false }) {
    return (_jsxs("div", { className: cn('group/status-row flex min-h-6 items-center gap-2 rounded-md px-1.5 py-1', 
        // row-hover bundles cursor:pointer — only when the row actually activates.
        onActivate ? 'row-hover' : 'hover:bg-(--ui-row-hover-background)', className), onClick: onActivate, onKeyDown: onActivate
            ? event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onActivate(event);
                }
            }
            : undefined, role: onActivate ? 'button' : undefined, tabIndex: onActivate ? 0 : undefined, children: [leading !== undefined && _jsx("span", { className: "flex size-3.5 shrink-0 items-center justify-center", children: leading }), _jsx("div", { className: "flex min-w-0 flex-1 items-center gap-2", children: children }), trailing && (_jsx("div", { className: cn('flex shrink-0 items-center gap-0.5', !trailingVisible && 'opacity-0 group-hover/status-row:opacity-100 group-focus-within/status-row:opacity-100'), children: trailing }))] }));
}
