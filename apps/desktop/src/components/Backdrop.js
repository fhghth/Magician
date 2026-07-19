import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Leva, useControls } from 'leva';
import { useEffect, useState } from 'react';
const BLEND_MODES = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity'
];
const assetPath = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
export function Backdrop() {
    const [controlsOpen, setControlsOpen] = useState(false);
    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }
        const onKeyDown = (event) => {
            const target = event.target;
            const editing = target?.isContentEditable ||
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement;
            if (editing || event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }
            if (event.shiftKey && event.code === 'KeyY') {
                setControlsOpen(open => !open);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
    const shape = useControls('UI / Shape', { radiusScalar: { value: 0.2, min: 0, max: 2, step: 0.1, label: 'radius scalar' } }, { collapsed: true });
    useEffect(() => {
        document.documentElement.style.setProperty('--radius-scalar', String(shape.radiusScalar));
    }, [shape.radiusScalar]);
    const statue = useControls('Backdrop / Statue', {
        enabled: { value: true, label: 'on' },
        opacity: { value: 0.025, min: 0, max: 1, step: 0.005 },
        blendMode: { value: 'difference', options: BLEND_MODES, label: 'blend' },
        invert: { value: true, label: 'invert color' },
        saturate: { value: 1, min: 0, max: 3, step: 0.05, label: 'saturate' },
        brightness: { value: 1, min: 0, max: 2, step: 0.05, label: 'brightness' },
        objectPosition: {
            value: 'top left',
            options: ['top left', 'top right', 'bottom left', 'bottom right', 'center', 'top', 'bottom', 'left', 'right'],
            label: 'position'
        },
        scale: { value: 160, min: 100, max: 300, step: 5, label: 'height (dvh)' }
    }, { collapsed: true });
    return (_jsxs(_Fragment, { children: [_jsx(Leva, { collapsed: true, hidden: !import.meta.env.DEV || !controlsOpen, titleBar: { title: 'backdrop', drag: true } }), statue.enabled && (_jsx("div", { "aria-hidden": true, className: "pointer-events-none absolute inset-0 z-2", style: {
                    mixBlendMode: statue.blendMode,
                    opacity: statue.opacity
                }, children: _jsx("img", { alt: "", className: "w-auto min-w-dvw object-cover", fetchPriority: "low", src: assetPath('ds-assets/filler-bg0.jpg'), style: {
                        height: `${statue.scale}dvh`,
                        objectPosition: statue.objectPosition,
                        filter: `invert(calc(${statue.invert ? 1 : 0} * var(--backdrop-invert-mul, 1))) saturate(${statue.saturate}) brightness(${statue.brightness})`
                    } }) }))] }));
}
