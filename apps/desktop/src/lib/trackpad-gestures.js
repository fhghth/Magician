// Trackpad / pointer gesture primitives shared across canvas + DOM surfaces.
//
// macOS quirk (Chromium/Electron): both pinch-zoom and "smart zoom" arrive as
// `wheel` events with `ctrlKey` synthetically set — there is no dedicated DOM
// event for either. They're disambiguated by their deltas:
//   - pinch-to-zoom: ctrlKey + a non-zero delta
//   - smart zoom:    ctrlKey + zero deltas   (the two-finger double-tap)
// Plain two-finger scroll has ctrlKey === false. Centralising this here keeps
// every zoom/pan surface from re-deriving the same OS trivia (and getting it
// wrong, which makes smart-zoom read as a zoom-in).
/** macOS "smart zoom" (two-finger double-tap): a ctrl-wheel with no delta. */
export function isSmartZoomWheel(e) {
    return e.ctrlKey && e.deltaX === 0 && e.deltaY === 0;
}
/** Pinch-to-zoom (or ctrl + mouse wheel): a ctrl-wheel carrying a delta. */
export function isPinchZoomWheel(e) {
    return e.ctrlKey && (e.deltaX !== 0 || e.deltaY !== 0);
}
export const DOUBLE_TAP_MS = 300;
/**
 * Stateful double-tap detector for surfaces where a real `dblclick` may never
 * fire (e.g. a trackpad with tap-to-click off). Call it once per discrete tap;
 * it returns true when two taps land within `thresholdMs` of each other, then
 * resets so a third tap starts a fresh pair.
 */
export function createDoubleTapDetector(thresholdMs = DOUBLE_TAP_MS) {
    let last = 0;
    return (now = Date.now()) => {
        if (now - last < thresholdMs) {
            last = 0;
            return true;
        }
        last = now;
        return false;
    };
}
