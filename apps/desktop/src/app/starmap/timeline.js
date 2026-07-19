import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Codicon } from '@/components/ui/codicon';
const ACTIVE_MARKER_CLASS = 'opacity-100';
const INACTIVE_MARKER_CLASS = 'opacity-30';
// Busiest bucket gets this many stars; quieter ones scale down proportionally.
const MAX_STARS_PER_BUCKET = 7;
// Deterministic PRNG (mulberry32) so a bucket's stars stay put across renders.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Scatter each time bucket's activity into stars: count ∝ events, split between
// skill- and memory-coloured stars, jittered within the bucket's horizontal slot
// and across the track height. Vertical placement is biased toward the midline
// (a triangular distribution) so stars cluster near the centre more often than
// the edges. A starmap timeline for a starmap.
function buildStars(axis) {
    const n = Math.max(1, axis.buckets.length);
    const stars = [];
    axis.buckets.forEach((b, i) => {
        if (b.total === 0) {
            return;
        }
        const intensity = axis.maxTotal > 0 ? b.total / axis.maxTotal : 0;
        // sqrt curve so a single co-timed burst (a packed core ring) doesn't crush
        // every quieter bucket down to the 1-star floor and read as blank.
        const count = Math.max(1, Math.round(Math.sqrt(intensity) * MAX_STARS_PER_BUCKET));
        const skillCount = Math.round((b.skill / b.total) * count);
        const r = rng(i * 9973 + 7);
        const slot = 1 / n;
        const center = (i + 0.5) / n;
        for (let s = 0; s < count; s++) {
            const jitter = (r() - 0.5) * slot * 0.9;
            // Average of two uniforms → triangular peak at 0.5, pulling stars toward
            // the midline more often while still reaching the edges occasionally.
            const vertical = (r() + r()) / 2;
            stars.push({
                delay: r() * 3,
                duration: 2.4 + r() * 2.6,
                kind: s < skillCount ? 'skill' : 'memory',
                leftPct: Math.max(0, Math.min(1, center + jitter)) * 100,
                // Brighter, slightly larger stars are rarer.
                opacity: 0.5 + r() * 0.5,
                // Floor at 2px so a lone star in a quiet bucket still reads on black.
                size: 2 + Math.round(r() * r() * 2.2),
                topPct: 12 + vertical * 76
            });
        }
    });
    return stars;
}
// Playback scrubber as a constellation: dim stars are the unrevealed future; a
// scanner sweep ignites them (bright + twinkling) left→right as the reveal
// advances. The bright layer is clipped by the reveal CSS var, so the rAF sweep
// in StarMap drives it with zero per-frame JS.
export const Timeline = memo(function Timeline({ axis, memoryColor = 'var(--theme-secondary)', onScrub, onTogglePlay, playing, revealStore, ringStops = [] }) {
    const trackRef = useRef(null);
    const draggingRef = useRef(false);
    const markerRefs = useRef([]);
    const stars = useMemo(() => buildStars(axis), [axis]);
    const syncReveal = useCallback((value) => {
        const reveal = Math.max(0, Math.min(1, value));
        const track = trackRef.current;
        if (track) {
            track.style.setProperty('--starmap-reveal', String(reveal));
            track.setAttribute('aria-valuenow', String(Math.round(reveal * 100)));
        }
        ringStops.forEach((stop, i) => {
            const el = markerRefs.current[i];
            if (!el) {
                return;
            }
            const active = stop <= reveal;
            el.classList.toggle(ACTIVE_MARKER_CLASS, active);
            el.classList.toggle(INACTIVE_MARKER_CLASS, !active);
        });
    }, [ringStops]);
    useEffect(() => revealStore.subscribe(syncReveal), [revealStore, syncReveal]);
    useEffect(() => {
        markerRefs.current.length = ringStops.length;
        syncReveal(revealStore.get());
    }, [revealStore, ringStops.length, syncReveal]);
    const ratioAt = (clientX) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) {
            return revealStore.get();
        }
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    const onPointerDown = (e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(ratioAt(e.clientX));
    };
    const onPointerMove = (e) => {
        if (draggingRef.current) {
            onScrub(ratioAt(e.clientX));
        }
    };
    const onPointerUp = (e) => {
        draggingRef.current = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };
    const colorFor = (kind) => (kind === 'skill' ? 'var(--theme-primary)' : memoryColor);
    return (_jsxs("div", { className: "pointer-events-auto flex w-[28rem] max-w-full items-center gap-3 [-webkit-app-region:no-drag]", children: [_jsx("style", { children: '@keyframes starmap-twinkle{0%,100%{opacity:var(--o,1)}50%{opacity:calc(var(--o,1) * 0.35)}}' }), _jsx("button", { "aria-label": playing ? 'Pause' : 'Play timeline', className: "flex size-5 shrink-0 items-center justify-center text-foreground/75 transition-colors hover:text-foreground", onClick: onTogglePlay, type: "button", children: _jsx(Codicon, { name: playing ? 'debug-pause' : 'triangle-right', size: playing ? '0.8rem' : '0.95rem' }) }), _jsxs("div", { "aria-label": "Timeline scrubber", "aria-valuemax": 100, "aria-valuemin": 0, "aria-valuenow": Math.round(revealStore.get() * 100), className: "relative h-7 min-w-0 flex-1 cursor-pointer select-none touch-none", onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, ref: trackRef, role: "slider", style: { '--starmap-reveal': revealStore.get() }, tabIndex: 0, children: [_jsx("div", { "aria-hidden": true, className: "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-foreground/5" }), _jsx("div", { "aria-hidden": true, className: "absolute inset-0", children: stars.map((star, i) => (_jsx("div", { className: "absolute -translate-x-1/2 -translate-y-1/2 rounded-full", style: {
                                backgroundColor: colorFor(star.kind),
                                height: star.size,
                                left: `${star.leftPct}%`,
                                opacity: 0.22,
                                top: `${star.topPct}%`,
                                width: star.size
                            } }, i))) }), _jsx("div", { "aria-hidden": true, className: "absolute inset-0", style: { clipPath: 'inset(0 calc((1 - var(--starmap-reveal, 1)) * 100%) 0 0)' }, children: stars.map((star, i) => {
                            const color = colorFor(star.kind);
                            return (_jsx("div", { className: "absolute -translate-x-1/2 -translate-y-1/2 rounded-full", style: {
                                    '--o': star.opacity,
                                    animation: `starmap-twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
                                    backgroundColor: color,
                                    height: star.size,
                                    left: `${star.leftPct}%`,
                                    opacity: star.opacity,
                                    top: `${star.topPct}%`,
                                    width: star.size
                                } }, i));
                        }) }), _jsx("div", { "aria-hidden": true, className: "absolute inset-0", children: ringStops.map((stop, i) => (_jsx("div", { className: `pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-primary)] ${INACTIVE_MARKER_CLASS}`, ref: el => {
                                if (el) {
                                    markerRefs.current[i] = el;
                                }
                            }, style: { left: `${stop * 100}%` } }, i))) }), _jsx("div", { "aria-hidden": true, className: "pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground", style: { left: 'calc(var(--starmap-reveal, 1) * 100%)' } })] })] }));
});
