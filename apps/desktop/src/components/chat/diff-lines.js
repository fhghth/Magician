'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { useShikiHighlighter } from 'react-shiki';
import { codeToTokens } from 'shiki';
import { chunkLines, useFixedRowWindow } from '@/components/chat/fixed-row-window';
import { exceedsHighlightBudget, SHIKI_THEME } from '@/components/chat/shiki-highlighter';
import { shikiLanguageForFilename } from '@/lib/markdown-code';
import { cn } from '@/lib/utils';
// Tint + 2px gutter accent per change kind. Text color is included for the
// plain renderer; the Shiki path omits it so syntax colors win, layering only
// the background + border.
const DIFF_KIND_TINT = {
    add: 'border-emerald-500 bg-emerald-500/12',
    context: 'border-transparent',
    remove: 'border-rose-500 bg-rose-500/12'
};
const DIFF_KIND_TEXT = {
    add: 'text-emerald-800 dark:text-emerald-200',
    context: '',
    remove: 'text-rose-800 dark:text-rose-200'
};
const DIFF_LINE_BASE = 'block min-w-max whitespace-pre border-l-2 px-2.5 py-px';
const PREVIEW_DIFF_LINE_BASE = 'block h-5 min-w-max whitespace-pre px-2.5 leading-5';
const PREVIEW_CHUNK_LINES = 200;
const PREVIEW_LINE_PX = 20;
const PREVIEW_OVERSCAN_LINES = 400;
// Bleed out of the tool-card body's `p-1.5` so tints/borders run flush to the
// card edges (rounded corners clip via the card's overflow); compact height
// with internal scroll like a code block.
// `overscroll-y-auto` so reaching the box's top/bottom hands the wheel back to
// the page (no scroll-trap); `overscroll-x-contain` keeps a trackpad's sideways
// overscroll on long code lines from firing browser back/forward navigation.
const DIFF_BOX_CLASS = '-mx-1.5 -mb-1.5 max-h-[12rem] max-w-none min-w-0 overflow-auto overscroll-x-contain overscroll-y-auto font-mono text-[0.7rem] leading-relaxed text-(--ui-text-secondary)';
function diffKind(line) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
        return 'add';
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
        return 'remove';
    }
    return 'context';
}
// Drop the leading +/-/space gutter so changes read by color alone, keeping the
// rest of the indentation intact.
function stripDiffMarker(line) {
    if (diffKind(line) !== 'context' || line.startsWith(' ')) {
        return line.slice(1);
    }
    return line;
}
// Git-style unified diffs arrive with a file-header preamble — `diff --git`,
// `index …`, `--- a/path`, `+++ b/path`, and Hermes' own `a/path → b/path`
// arrow line. That preamble just repeats the path (which the tool row already
// shows) and reads especially badly for absolute paths (`a//Users/…`). Strip
// the leading header zone up to the first hunk.
const DIFF_HEADER_PREFIXES = [
    'diff --git',
    'index ',
    '--- ',
    '+++ ',
    'similarity ',
    'rename ',
    'new file',
    'deleted file'
];
function isArrowHeaderLine(line) {
    const trimmed = line.trim();
    return trimmed.includes('→') && /^\S.*→\s*\S+$/.test(trimmed) && !/^[+\-@]/.test(trimmed);
}
/** Exported for tests. */
export function stripDiffFileHeaders(diff) {
    const lines = diff.split('\n');
    let start = 0;
    for (; start < lines.length; start += 1) {
        const line = lines[start];
        if (line.startsWith('@@')) {
            break;
        }
        if (line.trim() === '' || isArrowHeaderLine(line) || DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix))) {
            continue;
        }
        break;
    }
    return lines.slice(start).join('\n');
}
function parseHunks(diff) {
    const hunks = [];
    let active = null;
    for (const line of stripDiffFileHeaders(diff).split('\n')) {
        if (line.startsWith('@@')) {
            const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            if (!match) {
                active = null;
                continue;
            }
            active = { oldStart: Number(match[1]), newStart: Number(match[2]), lines: [] };
            hunks.push(active);
            continue;
        }
        if (!active || line.startsWith('\\')) {
            continue;
        }
        active.lines.push({ kind: diffKind(line), text: stripDiffMarker(line) });
    }
    return hunks;
}
// Cleaned diff → renderable lines: file-headers + `@@` hunks dropped (a blank
// separator kept between hunks), markers stripped, kind recorded. Old/new line
// numbers are tracked from each `@@ -a,b +c,d @@` header so a caller that wants
// a gutter (the preview) can render them; the blank separator carries none.
function parseDiff(diff) {
    const hunks = parseHunks(diff);
    if (hunks.length === 0) {
        // Fallback for unexpected non-hunk payloads.
        return stripDiffFileHeaders(diff)
            .split('\n')
            .map(line => ({ kind: diffKind(line), text: stripDiffMarker(line) }));
    }
    const out = [];
    let emitted = false;
    let oldNo = 1;
    let newNo = 1;
    for (const hunk of hunks) {
        oldNo = hunk.oldStart;
        newNo = hunk.newStart;
        if (emitted) {
            out.push({ kind: 'context', text: '' });
        }
        for (const line of hunk.lines) {
            const entry = { kind: line.kind, text: line.text };
            if (line.kind === 'add') {
                entry.newNo = newNo++;
            }
            else if (line.kind === 'remove') {
                entry.oldNo = oldNo++;
            }
            else {
                entry.oldNo = oldNo++;
                entry.newNo = newNo++;
            }
            out.push(entry);
            emitted = true;
        }
    }
    return out;
}
// Build a full-file diff view anchored to the CURRENT file text. Every current
// line is emitted from `fullText` with its real new-file line number; hunks only
// mark those rows as added and insert deleted rows between them. That keeps the
// preview's SOURCE and DIFF views on the same line map even when git returns
// compact hunks or removed-only rows.
function parseFullFileDiff(diff, fullText) {
    const hunks = parseHunks(diff);
    const fullLines = fullText.split('\n');
    if (hunks.length === 0) {
        return fullLines.map((text, index) => ({ kind: 'context', newNo: index + 1, oldNo: index + 1, text }));
    }
    const added = new Set();
    const oldNoByNewNo = new Map();
    const removalsByNewNo = new Map();
    const out = [];
    for (const hunk of hunks) {
        let oldNo = hunk.oldStart;
        let newNo = hunk.newStart;
        for (const line of hunk.lines) {
            if (line.kind === 'add') {
                added.add(newNo);
                newNo += 1;
            }
            else if (line.kind === 'remove') {
                const anchor = Math.max(1, Math.min(newNo, fullLines.length + 1));
                const bucket = removalsByNewNo.get(anchor) ?? [];
                bucket.push({ kind: 'remove', oldNo, text: line.text });
                removalsByNewNo.set(anchor, bucket);
                oldNo += 1;
            }
            else {
                oldNoByNewNo.set(newNo, oldNo);
                oldNo += 1;
                newNo += 1;
            }
        }
    }
    for (let index = 0; index < fullLines.length; index += 1) {
        const newNo = index + 1;
        const removals = removalsByNewNo.get(newNo);
        if (removals) {
            out.push(...removals);
        }
        out.push({
            kind: added.has(newNo) ? 'add' : 'context',
            newNo,
            oldNo: oldNoByNewNo.get(newNo),
            text: fullLines[index] ?? ''
        });
    }
    const trailingRemovals = removalsByNewNo.get(fullLines.length + 1);
    if (trailingRemovals) {
        out.push(...trailingRemovals);
    }
    return out;
}
function DiffBody({ lines, syntax }) {
    return (_jsx(_Fragment, { children: lines.map((line, index) => (_jsx("span", { className: cn(DIFF_LINE_BASE, DIFF_KIND_TINT[line.kind], !syntax && DIFF_KIND_TEXT[line.kind]), children: line.text || ' ' }, `${index}-${line.text}`))) }));
}
// shiki FontStyle is a bitmask: Italic=1, Bold=2, Underline=4.
function tokenStyle({ bgColor, color, fontStyle = 0 }) {
    if (!color && !bgColor && !fontStyle) {
        return undefined;
    }
    return {
        backgroundColor: bgColor,
        color,
        fontStyle: fontStyle & 1 ? 'italic' : undefined,
        fontWeight: fontStyle & 2 ? 700 : undefined,
        textDecorationLine: fontStyle & 4 ? 'underline' : undefined
    };
}
function useThemeName() {
    const current = () => (document.documentElement.classList.contains('dark') ? SHIKI_THEME.dark : SHIKI_THEME.light);
    const [theme, setTheme] = React.useState(current);
    React.useEffect(() => {
        const observer = new MutationObserver(() => setTheme(current()));
        observer.observe(document.documentElement, { attributeFilter: ['class'], attributes: true });
        return () => observer.disconnect();
    }, []);
    return theme;
}
function PreviewDiffRows({ afterLines = 0, beforeLines = 0, chunks, tokens }) {
    return (_jsxs(_Fragment, { children: [beforeLines > 0 && _jsx("div", { "aria-hidden": true, style: { height: beforeLines * PREVIEW_LINE_PX } }), chunks.map(chunk => (_jsx("div", { className: "block", children: chunk.lines.map((line, offset) => {
                    const index = chunk.start + offset;
                    const rowTokens = tokens?.[index] ?? [];
                    return (_jsx("span", { className: cn(PREVIEW_DIFF_LINE_BASE, DIFF_KIND_TINT[line.kind]), children: rowTokens.length > 0
                            ? rowTokens.map((token, tokenIndex) => (_jsx("span", { style: tokenStyle(token), children: token.content }, `${tokenIndex}-${token.offset}`)))
                            : line.text || ' ' }, `${index}-${line.text}`));
                }) }, chunk.start))), afterLines > 0 && _jsx("div", { "aria-hidden": true, style: { height: afterLines * PREVIEW_LINE_PX } })] }));
}
function TokenizedDiffBody({ afterLines, beforeLines, chunked = false, chunks, language, lines }) {
    const code = React.useMemo(() => lines.map(line => line.text).join('\n'), [lines]);
    const theme = useThemeName();
    const [tokens, setTokens] = React.useState(null);
    React.useEffect(() => {
        let cancelled = false;
        setTokens(null);
        void codeToTokens(code, { lang: language, theme })
            .then(result => {
            if (!cancelled) {
                setTokens(result.tokens);
            }
        })
            .catch(() => {
            if (!cancelled) {
                setTokens([]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [code, language, theme]);
    if (!tokens) {
        return chunked ? (_jsx(PreviewDiffRows, { afterLines: afterLines, beforeLines: beforeLines, chunks: chunks ?? chunkLines(lines, PREVIEW_CHUNK_LINES) })) : (_jsx(DiffBody, { lines: lines }));
    }
    if (chunked) {
        return (_jsx(PreviewDiffRows, { afterLines: afterLines, beforeLines: beforeLines, chunks: chunks ?? chunkLines(lines, PREVIEW_CHUNK_LINES), tokens: tokens }));
    }
    return (_jsx(_Fragment, { children: lines.map((line, index) => {
            const rowTokens = tokens[index] ?? [];
            return (_jsx("span", { className: cn(PREVIEW_DIFF_LINE_BASE, DIFF_KIND_TINT[line.kind]), children: rowTokens.length > 0
                    ? rowTokens.map((token, tokenIndex) => (_jsx("span", { style: tokenStyle(token), children: token.content }, `${tokenIndex}-${token.offset}`)))
                    : line.text || ' ' }, `${index}-${line.text}`));
        }) }));
}
// Shiki transformer: tag each `.line` with the diff tint for its kind, so the
// syntax-highlighted output keeps add/remove backgrounds + the gutter accent.
function diffLineTransformer(kinds) {
    return {
        line(node, line) {
            const kind = kinds[line - 1] ?? 'context';
            const existing = Array.isArray(node.properties.className)
                ? node.properties.className
                : node.properties.className
                    ? [String(node.properties.className)]
                    : [];
            node.properties.className = [...existing, DIFF_LINE_BASE, DIFF_KIND_TINT[kind]];
        }
    };
}
function SyntaxDiff({ language, lines }) {
    const code = React.useMemo(() => lines.map(line => line.text).join('\n'), [lines]);
    const transformers = React.useMemo(() => [diffLineTransformer(lines.map(line => line.kind))], [lines]);
    const highlighted = useShikiHighlighter(code, language, SHIKI_THEME, {
        defaultColor: 'light-dark()',
        transformers
    });
    // Until Shiki resolves, show the plain colored diff so there's no flash.
    return highlighted ?? _jsx(DiffBody, { lines: lines });
}
export function DiffLines({ className, text, ...props }) {
    const lines = React.useMemo(() => parseDiff(text), [text]);
    return (_jsx("pre", { className: cn(DIFF_BOX_CLASS, className), "data-slot": "diff-lines", ...props, children: _jsx(DiffBody, { lines: lines }) }));
}
// Coalesce consecutive same-kind changed rows into runs, each placed by line
// fraction (no DOM measurement). Context rows produce no tick.
function overviewRuns(lines) {
    const total = lines.length || 1;
    const runs = [];
    for (let i = 0; i < lines.length;) {
        const kind = lines[i].kind;
        if (kind === 'context') {
            i += 1;
            continue;
        }
        let j = i + 1;
        while (j < lines.length && lines[j].kind === kind) {
            j += 1;
        }
        runs.push({ kind, sizePct: ((j - i) / total) * 100, startPct: (i / total) * 100 });
        i = j;
    }
    return runs;
}
// VS Code-style overview ruler: a thin strip pinned to the diff's right edge with
// a green/red tick per change, positioned by line fraction. Pinned to the
// viewport (not the scrolled content) by living as an absolute sibling of the
// scroller inside a relative wrapper — so no scroll listener or measurement.
function DiffOverviewRuler({ lines }) {
    const runs = React.useMemo(() => overviewRuns(lines), [lines]);
    if (runs.length === 0) {
        return null;
    }
    return (_jsx("div", { "aria-hidden": true, className: "pointer-events-none absolute top-0 right-0 bottom-0 w-1.5 opacity-80", children: _jsx("div", { className: "relative w-full", style: { height: `min(100%, ${lines.length * PREVIEW_LINE_PX}px)` }, children: runs.map((run, index) => (_jsx("div", { className: cn('absolute inset-x-0', run.kind === 'add' ? 'bg-(--ui-green)' : 'bg-(--ui-red)'), style: { height: `max(0.125rem, ${run.sizePct}%)`, top: `${run.startPct}%` } }, index))) }) }));
}
export function FileDiffPanel({ className, diff, fullText, path, showLineNumbers = false }) {
    const lines = React.useMemo(() => (fullText != null ? parseFullFileDiff(diff, fullText) : parseDiff(diff)), [diff, fullText]);
    const lineChunks = React.useMemo(() => chunkLines(lines, PREVIEW_CHUNK_LINES), [lines]);
    const { afterRows, beforeRows, endChunk, onScroll, scrollerRef, startChunk } = useFixedRowWindow({
        overscanRows: PREVIEW_OVERSCAN_LINES,
        rowPx: PREVIEW_LINE_PX,
        rowsPerChunk: PREVIEW_CHUNK_LINES,
        totalRows: lines.length
    });
    const visibleLineChunks = lineChunks.slice(startChunk, endChunk + 1);
    const language = shikiLanguageForFilename(path);
    const canHighlight = Boolean(language) && !exceedsHighlightBudget(fullText ?? diff);
    // Full-file preview: we own the rows (tokens rendered inside) so blank lines
    // can't collapse. Compact tool/review diffs let Shiki own the rows.
    const body = !canHighlight ? (showLineNumbers ? (_jsx(PreviewDiffRows, { afterLines: afterRows, beforeLines: beforeRows, chunks: visibleLineChunks })) : (_jsx(DiffBody, { lines: lines }))) : fullText != null ? (_jsx(TokenizedDiffBody, { afterLines: afterRows, beforeLines: beforeRows, chunked: showLineNumbers, chunks: visibleLineChunks, language: language, lines: lines })) : (_jsx(SyntaxDiff, { language: language, lines: lines }));
    if (!showLineNumbers) {
        return (_jsx("div", { className: cn(DIFF_BOX_CLASS, className), "data-slot": "file-diff-panel", children: body }));
    }
    // A single line-number gutter (VS Code's inline-diff style): each row shows its
    // own file's number — the new number for context/adds, the old number for
    // removals — with an overview ruler pinned to the right edge. The inner div
    // owns the scroll so the ruler (an absolute sibling) stays viewport-fixed.
    return (_jsxs("div", { className: cn(DIFF_BOX_CLASS, 'relative overflow-hidden', className), "data-slot": "file-diff-panel", children: [_jsx("div", { className: "absolute inset-0 overflow-auto pr-2.5", onScroll: onScroll, ref: scrollerRef, children: _jsxs("div", { className: "grid min-w-max grid-cols-[auto_minmax(0,1fr)]", children: [_jsxs("div", { className: "sticky left-0 z-1 select-none bg-(--ui-editor-surface-background) py-3 text-muted-foreground/55", children: [beforeRows > 0 && _jsx("div", { "aria-hidden": true, style: { height: beforeRows * PREVIEW_LINE_PX } }), visibleLineChunks.map(chunk => (_jsx("div", { className: "block", children: chunk.lines.map((line, offset) => {
                                        const index = chunk.start + offset;
                                        return (_jsx("div", { className: "h-5 w-9 pr-2 text-right leading-5 tabular-nums", children: line.newNo ?? '' }, `${index}-${line.oldNo}-${line.newNo}`));
                                    }) }, chunk.start))), afterRows > 0 && _jsx("div", { "aria-hidden": true, style: { height: afterRows * PREVIEW_LINE_PX } })] }), _jsx("div", { className: "min-w-0", children: body })] }) }), _jsx(DiffOverviewRuler, { lines: lines })] }));
}
