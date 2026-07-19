import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
const assetPath = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
// Brand badge: nous-girl mark on a white tile, identical in light/dark.
// Fills the tile (softly rounded); size via className (default size-14).
export function BrandMark({ className, ...props }) {
    return (_jsx("span", { className: cn('inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white', className), ...props, children: _jsx("img", { alt: "", className: "size-full object-contain", src: assetPath('nous-girl.jpg') }) }));
}
