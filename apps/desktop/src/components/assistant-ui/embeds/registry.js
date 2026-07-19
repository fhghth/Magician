'use client';
import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { lazy, Suspense } from 'react';
import { RichBoundary } from './rich-boundary';
// Root renderer for fenced code blocks: a language → lazy-renderer table. Each
// renderer is its own split chunk (mermaid pulls in the mermaid lib, svg pulls
// in DOMPurify), loaded only when a block of that language actually appears.
const LAZY_FENCE = {
    mermaid: lazy(() => import('./mermaid-embed')),
    svg: lazy(() => import('./svg-embed'))
};
export const RICH_FENCE_LANGUAGES = new Set(Object.keys(LAZY_FENCE));
export function RichCodeBlock({ code, fallback, language, streaming }) {
    const Renderer = language ? LAZY_FENCE[language.toLowerCase()] : undefined;
    if (!Renderer) {
        return _jsx(_Fragment, { children: fallback });
    }
    return (_jsx(RichBoundary, { fallback: fallback, resetKey: code, children: _jsx(Suspense, { fallback: fallback, children: _jsx(Renderer, { code: code, streaming: streaming }) }) }));
}
