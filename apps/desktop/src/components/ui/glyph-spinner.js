import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import spinners from 'unicode-animations';
import { cn } from '@/lib/utils';
// Some spinners ship multi-character frames. Pull the first cell so each
// frame fits in one monospace box — matches how the TUI uses them.
const FRAMES_BY_NAME = (() => {
    const out = {};
    for (const name of Object.keys(spinners)) {
        const raw = spinners[name];
        out[name] = {
            frames: raw.frames.map(frame => [...frame][0] ?? '⠀'),
            interval: raw.interval
        };
    }
    return out;
})();
/**
 * One-char glyph spinner driven by `unicode-animations` (braille, orbit, scan,
 * etc. — pick any `spinner` name). Mirrors the spinner used by the Ink TUI so
 * the desktop and terminal experiences read the same visually. Renders inside
 * an `inline-flex` cell with `leading-none` and `items-center` so it sits
 * vertically centred inside its parent's line-box.
 */
export function GlyphSpinner({ ariaLabel = 'Loading', className, spinner = 'braille' }) {
    const spin = FRAMES_BY_NAME[spinner] ?? FRAMES_BY_NAME.braille;
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        setFrame(0);
        const id = window.setInterval(() => setFrame(f => (f + 1) % spin.frames.length), spin.interval);
        return () => window.clearInterval(id);
    }, [spin]);
    return (_jsx("span", { "aria-label": ariaLabel, className: cn('inline-flex items-center justify-center font-mono leading-none tabular-nums', className), role: "status", children: spin.frames[frame] }));
}
