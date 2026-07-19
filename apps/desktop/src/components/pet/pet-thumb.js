import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { PawPrint } from '@/lib/icons';
// petdex frames are a fixed 192×208 grid; the box matches that aspect.
const THUMB_W = 40;
const THUMB_H = Math.round((THUMB_W * 208) / 192);
/**
 * Idle-frame preview for one pet. The backend crops + caches the frame and
 * returns it as a same-origin data URI (`pet.thumb`), which dodges the renderer
 * CSP / R2 hotlink rules that break a direct `<img src=cdn>`.
 */
export function PetThumb({ slug, url, alt, load, size = THUMB_W }) {
    const [src, setSrc] = useState(null);
    const boxRef = useRef(null);
    const height = Math.round((size * 208) / 192);
    useEffect(() => {
        const el = boxRef.current;
        if (!el || src) {
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect();
                void load(slug, url).then(uri => {
                    if (uri) {
                        setSrc(uri);
                    }
                });
            }
        }, { rootMargin: '120px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [slug, url, src, load]);
    return (_jsx("span", { className: "grid shrink-0 place-items-center overflow-hidden rounded-md bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)", ref: boxRef, style: { height, width: size }, children: src ? (_jsx("img", { alt: alt, "aria-hidden": true, className: "pointer-events-none size-full object-contain", src: src, style: { imageRendering: 'pixelated' } })) : (_jsx(PawPrint, { className: "size-4" })) }));
}
