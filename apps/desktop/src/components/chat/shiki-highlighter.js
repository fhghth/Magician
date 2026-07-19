'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import ShikiHighlighter from 'react-shiki';
import { CodeCard, CodeCardBody, CodeCardHeader, CodeCardIcon, CodeCardSubtitle, CodeCardTitle } from '@/components/chat/code-card';
import { ExpandableBlock } from '@/components/chat/expandable-block';
import { CopyButton } from '@/components/ui/copy-button';
import { useI18n } from '@/i18n';
import { codiconForLanguage, isLikelyProseCodeBlock, sanitizeLanguageTag } from '@/lib/markdown-code';
// `github-dark-dimmed` is GitHub's lower-contrast dark palette — the vivid
// `github-dark-default` tokens read harsh at our small code size. Shared by the
// inline diff renderer too (see diff-lines.tsx) so code + diffs match.
export const SHIKI_THEME = { dark: 'github-dark-dimmed', light: 'github-light-default' };
/**
 * `github-light-default` colors comments `#6e7781` (~4.2:1 against the code
 * card background) — borderline unreadable at our 11px code size, and worst of
 * all for shell snippets where a single `#` turns the rest of the line into one
 * long comment span. Remap light-mode comments to GitHub's darker muted gray
 * (`#57606a`, ~6.4:1). Dark mode (`#8b949e`, ~6.1:1) already reads fine, so we
 * leave it untouched. Keyed per theme name so the bump only applies in light.
 */
const SHIKI_COLOR_REPLACEMENTS = {
    'github-light-default': { '#6e7781': '#57606a' }
};
const MAX_HIGHLIGHT_CHARS = 150_000;
const MAX_HIGHLIGHT_LINES = 3_000;
const CHUNK_LINES = 200;
const EST_LINE_PX = 16;
export function exceedsHighlightBudget(code) {
    if (code.length > MAX_HIGHLIGHT_CHARS) {
        return true;
    }
    let lines = 1;
    let idx = code.indexOf('\n');
    while (idx !== -1) {
        if ((lines += 1) > MAX_HIGHLIGHT_LINES) {
            return true;
        }
        idx = code.indexOf('\n', idx + 1);
    }
    return false;
}
export function chunkByLines(code, perChunk) {
    const lines = code.split('\n');
    if (lines.length <= perChunk) {
        return [{ text: code, lines: lines.length }];
    }
    const chunks = [];
    for (let i = 0; i < lines.length; i += perChunk) {
        const slice = lines.slice(i, i + perChunk);
        chunks.push({ text: slice.join('\n'), lines: slice.length });
    }
    return chunks;
}
const PlainCode = ({ code }) => {
    const chunks = useMemo(() => chunkByLines(code, CHUNK_LINES), [code]);
    if (chunks.length === 1) {
        return _jsx("code", { className: "block whitespace-pre", children: code });
    }
    return (_jsx(_Fragment, { children: chunks.map((chunk, index) => (_jsx("code", { className: "block whitespace-pre [content-visibility:auto]", style: { containIntrinsicSize: `auto ${chunk.lines * EST_LINE_PX}px` }, children: chunk.text }, index))) }));
};
export const SyntaxHighlighter = ({ components: { Pre }, language, code, defer = false }) => {
    const { t } = useI18n();
    const trimmed = (code ?? '').replace(/^\n+/, '').trimEnd();
    // Streaming may hand us empty/incomplete fences — render nothing rather
    // than a transient empty card.
    if (!trimmed.trim()) {
        return null;
    }
    if (isLikelyProseCodeBlock(language, trimmed)) {
        return _jsx("div", { className: "aui-prose-fence whitespace-pre-wrap wrap-anywhere text-foreground", children: trimmed });
    }
    const cleanLanguage = sanitizeLanguageTag(language || '');
    const label = cleanLanguage && cleanLanguage !== 'unknown' ? cleanLanguage : '';
    const plain = defer || exceedsHighlightBudget(trimmed);
    return (_jsxs(CodeCard, { "data-streaming": defer ? 'true' : undefined, children: [_jsxs(CodeCardHeader, { children: [_jsxs(CodeCardTitle, { children: [_jsx(CodeCardIcon, { name: codiconForLanguage(label) }), t.assistant.tool.code, label && _jsxs(CodeCardSubtitle, { children: [" \u00B7 ", label] })] }), _jsx(CopyButton, { appearance: "inline", className: "-my-1 -mr-1 h-5 px-1 opacity-55 hover:opacity-100", iconClassName: "size-2.5", label: t.assistant.tool.copyCode, showLabel: false, text: trimmed })] }), _jsx(CodeCardBody, { children: _jsx(ExpandableBlock, { children: _jsx(Pre, { className: "aui-shiki m-0 overflow-hidden bg-transparent p-0", children: plain ? (_jsx(PlainCode, { code: trimmed })) : (_jsx(ShikiHighlighter, { addDefaultStyles: false, as: "div", colorReplacements: SHIKI_COLOR_REPLACEMENTS, defaultColor: "light-dark()", delay: 120, language: language || 'text', showLanguage: false, theme: SHIKI_THEME, children: trimmed })) }) }) })] }));
};
