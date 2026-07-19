import { atom } from 'nanostores';
import { persistBoolean, persistString, storedBoolean, storedString } from '@/lib/storage';
const POPOUT_ENABLED_STORAGE_KEY = 'hermes.desktop.composerPopout.enabled';
const POPOUT_POSITION_STORAGE_KEY = 'hermes.desktop.composerPopout.position';
// Floating composer width (rem). Shared by the inline style that sets
// --composer-popout-width and the peel-off drag math.
export const POPOUT_WIDTH_REM = 19.5;
// Default pop-out placement: tucked into the bottom-right of the thread, clear
// of the window chrome. Matches the brief's "default to the right bottom".
const DEFAULT_POSITION = { bottom: 24, right: 24 };
function readPosition() {
    const raw = storedString(POPOUT_POSITION_STORAGE_KEY);
    if (!raw) {
        return DEFAULT_POSITION;
    }
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.bottom === 'number' && typeof parsed.right === 'number') {
            // Clamp on load — a position persisted on a larger/other monitor must not
            // strand the box off-screen on this one.
            return clampPosition({ bottom: parsed.bottom, right: parsed.right });
        }
    }
    catch {
        // Corrupt value — fall back to the default corner.
    }
    return DEFAULT_POSITION;
}
// Keep at least this much between the box and every edge of its bounds, so the
// floating composer can never be dragged (or restored) out of reach.
const EDGE_MARGIN = 8;
// Height floor used when the real box height is unknown (init / load / peel-off).
export const POPOUT_ESTIMATED_HEIGHT = 56;
const MIN_VISIBLE_HEIGHT = POPOUT_ESTIMATED_HEIGHT;
const clampRange = (value, lo, hi) => Math.min(Math.max(value, lo), Math.max(lo, hi));
const rootFontSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
/** The thread area's viewport rect (excludes a pinned sidebar + the header), or
 *  undefined before it mounts — callers then fall back to the full window. */
export function readPopoutBounds(composer) {
    const el = (composer?.parentElement ?? document).querySelector('[data-slot="composer-bounds"]');
    if (!el) {
        return undefined;
    }
    const { bottom, height, left, right, top, width } = el.getBoundingClientRect();
    // Pre-layout (mount before first layout) the rect is empty — fall back to the
    // window rather than clamping the box into a collapsed area.
    return width > 0 && height > 0 ? { bottom, left, right, top } : undefined;
}
// Bound the bottom/right inset so the WHOLE box stays inside `area` (the thread
// region, or the window by default) — the corner anchor alone would let the
// box's width/height push it past the opposite edges.
function clampPosition({ bottom, right }, size, area) {
    const width = size?.width || POPOUT_WIDTH_REM * rootFontSize();
    const height = size?.height || MIN_VISIBLE_HEIGHT;
    const { innerHeight: vh, innerWidth: vw } = window;
    const a = area ?? { bottom: vh, left: 0, right: vw, top: 0 };
    return {
        bottom: clampRange(bottom, vh - a.bottom + EDGE_MARGIN, vh - a.top - height - EDGE_MARGIN),
        right: clampRange(right, vw - a.right + EDGE_MARGIN, vw - a.left - width - EDGE_MARGIN)
    };
}
export const $composerPoppedOut = atom(storedBoolean(POPOUT_ENABLED_STORAGE_KEY, false));
export const $composerPopoutPosition = atom(readPosition());
export function setComposerPoppedOut(value) {
    $composerPoppedOut.set(value);
    persistBoolean(POPOUT_ENABLED_STORAGE_KEY, value);
}
/** Move the box (state only by default). Used per-frame during a drag — no IO
 *  unless `persist`. Returns the clamped position so callers can sync their live
 *  ref. Pass the measured `size` for exact bounds; otherwise a fallback keeps it
 *  on-screen. */
export function setComposerPopoutPosition(position, { area, persist, size } = {}) {
    const next = clampPosition(position, size, area);
    $composerPopoutPosition.set(next);
    if (persist) {
        persistString(POPOUT_POSITION_STORAGE_KEY, JSON.stringify(next));
    }
    return next;
}
