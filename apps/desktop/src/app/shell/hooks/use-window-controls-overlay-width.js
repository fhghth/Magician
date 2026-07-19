import { useEffect, useState } from 'react';
const overlay = () => navigator.windowControlsOverlay ?? null;
function measure(wco) {
    const rect = wco?.visible ? wco.getTitlebarAreaRect() : null;
    // No overlay, or it isn't laid out yet.
    if (!rect?.width) {
        return null;
    }
    const width = Math.round(window.innerWidth - rect.right);
    return width > 0 ? width : null;
}
/**
 * Live width (px) of the right-side native window-controls overlay, or null when
 * the platform/build exposes no overlay (caller should use the static fallback).
 */
export function useWindowControlsOverlayWidth() {
    const [width, setWidth] = useState(() => measure(overlay()));
    useEffect(() => {
        const wco = overlay();
        if (!wco) {
            return;
        }
        const update = () => setWidth(measure(wco));
        // Re-measure on overlay geometry changes (maximize/restore, DPI) and on
        // window resize (innerWidth feeds the calc).
        wco.addEventListener('geometrychange', update);
        window.addEventListener('resize', update);
        update();
        return () => {
            wco.removeEventListener('geometrychange', update);
            window.removeEventListener('resize', update);
        };
    }, []);
    return width;
}
