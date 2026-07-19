const PREVIEW_MARKDOWN_RE = /\[Preview:[^\]]+\]\((?<href>#preview[:/][^)]+)\)/gi;
export function stripPreviewTargets(text) {
    return text
        .replace(PREVIEW_MARKDOWN_RE, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export function extractPreviewTargets(text) {
    const targets = [];
    const seen = new Set();
    for (const match of text.matchAll(PREVIEW_MARKDOWN_RE)) {
        const target = previewTargetFromMarkdownHref(match.groups?.href);
        if (target && !seen.has(target)) {
            seen.add(target);
            targets.push(target);
        }
    }
    return targets;
}
export function previewMarkdownHref(target) {
    return `#preview/${encodeURIComponent(target)}`;
}
export function previewTargetFromMarkdownHref(href) {
    if (!href?.startsWith('#preview:') && !href?.startsWith('#preview/')) {
        return null;
    }
    try {
        return decodeURIComponent(href.slice('#preview'.length + 1));
    }
    catch {
        return null;
    }
}
export function previewName(target) {
    try {
        const url = new URL(target);
        if (url.protocol === 'file:') {
            return decodeURIComponent(url.pathname).split(/[\\/]/).filter(Boolean).pop() || target;
        }
        const file = url.pathname.split('/').filter(Boolean).pop();
        return file || url.host;
    }
    catch {
        return target.split(/[\\/]/).filter(Boolean).pop() || target;
    }
}
export function previewDisplayLabel(target) {
    const escaped = previewName(target).replace(/[[\]\\]/g, '\\$&');
    return `Preview: ${escaped}`;
}
