'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import mermaid from 'mermaid';
import { useEffect, useState } from 'react';
import { Zoomable } from '@/components/ui/zoomable';
import { copySvgAsPng } from '@/lib/svg-image';
import { cn } from '@/lib/utils';
import { useIsDark } from './use-is-dark';
let lastTheme = null;
// Re-initialise only on first use / theme flip. `securityLevel: 'strict'` makes
// mermaid sanitise label HTML and drop click handlers, so the rendered SVG is
// safe to inject.
function ensureInit(dark) {
    const theme = dark ? 'dark' : 'default';
    if (theme === lastTheme) {
        return;
    }
    mermaid.initialize({ fontFamily: 'inherit', securityLevel: 'strict', startOnLoad: false, theme });
    lastTheme = theme;
}
function SourcePreview({ code, muted }) {
    return (_jsx("pre", { className: cn('overflow-auto p-3 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap wrap-anywhere', muted ? 'text-muted-foreground/70' : 'text-foreground/90'), children: code }));
}
// Lazy chunk (pulls in mermaid). Renders ```mermaid fences as diagrams; shows
// the source while the message streams (partial syntax throws) and falls back
// to source on parse failure.
export default function MermaidRenderer({ code, streaming }) {
    const isDark = useIsDark();
    const [svg, setSvg] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (streaming) {
            return;
        }
        let cancelled = false;
        setFailed(false);
        void (async () => {
            try {
                ensureInit(isDark);
                const id = `mmd-${Math.random().toString(36).slice(2)}`;
                const result = await mermaid.render(id, code);
                if (!cancelled) {
                    setSvg(result.svg);
                }
            }
            catch {
                if (!cancelled) {
                    setFailed(true);
                    setSvg('');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [code, isDark, streaming]);
    if (streaming) {
        return _jsx(SourcePreview, { code: code, muted: true });
    }
    if (failed) {
        return _jsx(SourcePreview, { code: code });
    }
    if (!svg) {
        return _jsx(SourcePreview, { code: code, muted: true });
    }
    // Click to open the diagram full-screen with pan/zoom + copy-as-PNG. The
    // overlay keeps the diagram's natural width (capped to the viewport) so it
    // renders before any zoom; the inline version stays capped at 33dvh.
    return (_jsx(Zoomable, { label: "Open diagram", onCopy: () => copySvgAsPng(svg), overlay: _jsx("div", { className: "[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[80vh] [&_svg]:max-w-[85vw]", dangerouslySetInnerHTML: { __html: svg } }), children: _jsx("div", { className: "overflow-hidden p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[33dvh] [&_svg]:max-w-full", dangerouslySetInnerHTML: { __html: svg } }) }));
}
