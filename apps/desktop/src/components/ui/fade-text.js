import { jsx as _jsx } from "react/jsx-runtime";
import { memo, useCallback, useRef, useState } from 'react';
import { useResizeObserver } from '@/hooks/use-resize-observer';
import { cn } from '@/lib/utils';
/**
 * Single-line text that fades out instead of truncating with an ellipsis.
 *
 * Uses an inline mask-image so the fade resolves against whatever the parent
 * background is — no need to know the surface color, no after-pseudo overlap.
 * The mask is only applied when the text is actually overflowing, so short
 * strings render as plain text without an unnecessary gradient on their tail.
 *
 * Layout reads (`el.scrollWidth`) are forced reflows. To avoid measuring
 * once per parent re-render — which during streaming happens on every token —
 * we only re-measure when the ResizeObserver fires (real size changes), not
 * on every `children` reference change. Wrapped in `memo` with a custom
 * comparator so scalar-string children skip re-render entirely when the text
 * is unchanged but the parent re-rendered.
 */
function FadeTextImpl({ children, className, fadeWidth = '3rem', style, ...rest }) {
    const ref = useRef(null);
    const [overflowing, setOverflowing] = useState(false);
    const measureOverflow = useCallback((entries) => {
        const el = ref.current;
        if (!el) {
            return;
        }
        // `clientWidth` from the RO entry when available (already computed);
        // `scrollWidth` is unavoidable — content width isn't part of the entry —
        // but inside RO timing layout is already clean so the read is cheap.
        const clientWidth = entries.find(entry => entry.target === el)?.contentRect?.width ?? el.clientWidth;
        // setState is identity-stable: React bails out when the boolean doesn't
        // change, so repeated RO fires with the same answer don't re-render.
        setOverflowing(el.scrollWidth - clientWidth > 1);
    }, []);
    useResizeObserver(measureOverflow, ref);
    const maskStyle = overflowing
        ? {
            maskImage: `linear-gradient(to right, black calc(100% - ${fadeWidth}), transparent)`,
            WebkitMaskImage: `linear-gradient(to right, black calc(100% - ${fadeWidth}), transparent)`,
            ...style
        }
        : (style ?? {});
    return (_jsx("span", { ...rest, className: cn('block min-w-0 max-w-full overflow-hidden whitespace-nowrap', className), ref: ref, style: maskStyle, children: children }));
}
function styleEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) {
        return false;
    }
    for (const k of aKeys) {
        if (a[k] !== b[k]) {
            return false;
        }
    }
    return true;
}
export const FadeText = memo(FadeTextImpl, (prev, next) => {
    if (prev.className !== next.className) {
        return false;
    }
    if (prev.fadeWidth !== next.fadeWidth) {
        return false;
    }
    if (!styleEqual(prev.style, next.style)) {
        return false;
    }
    // Cheap path: the common case is a scalar string/number child. Identity
    // comparison is correct for any other element type (a new JSX node should
    // force a re-render).
    return prev.children === next.children;
});
