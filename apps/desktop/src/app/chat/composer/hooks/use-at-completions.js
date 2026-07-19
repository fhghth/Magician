import { useCallback } from 'react';
import { normalize } from '@/lib/text';
import { useLiveCompletionAdapter } from './use-live-completion-adapter';
const KIND_RE = /^@(file|folder|url|image|tool|git):(.*)$/;
const REF_STARTERS = new Set(['file', 'folder', 'url', 'image', 'tool', 'git']);
const STARTER_META = {
    file: 'Attach a file reference',
    folder: 'Attach a folder reference',
    url: 'Attach a URL reference',
    image: 'Attach an image reference',
    tool: 'Attach a tool reference',
    git: 'Attach git context'
};
function starterEntries(query) {
    const q = normalize(query);
    const kinds = Array.from(REF_STARTERS);
    const filtered = q ? kinds.filter(kind => kind.startsWith(q)) : kinds;
    return filtered.map(kind => ({
        text: `@${kind}:`,
        display: `@${kind}:`,
        meta: STARTER_META[kind] || ''
    }));
}
function textValue(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
/** Parse the gateway's `text` field (`@file:src/foo.ts`, `@diff`, `@folder:`) into popover-ready data. */
function classify(entry) {
    const match = KIND_RE.exec(entry.text);
    if (match) {
        const [, kind, rest] = match;
        return {
            type: kind,
            insertId: rest,
            display: textValue(entry.display, rest || `@${kind}:`),
            meta: textValue(entry.meta)
        };
    }
    return {
        type: 'simple',
        insertId: entry.text,
        display: textValue(entry.display, entry.text),
        meta: textValue(entry.meta)
    };
}
/** Live `@` completions backed by the gateway's `complete.path` RPC. */
export function useAtCompletions(options) {
    const { gateway, sessionId, cwd } = options;
    const enabled = Boolean(gateway);
    const fetcher = useCallback(async (query) => {
        const starters = starterEntries(query);
        if (!gateway) {
            return { items: starters, query };
        }
        const word = REF_STARTERS.has(query) ? `@${query}:` : `@${query}`;
        const params = { word };
        if (sessionId) {
            params.session_id = sessionId;
        }
        if (cwd) {
            params.cwd = cwd;
        }
        try {
            const result = await gateway.request('complete.path', params);
            const items = result.items ?? [];
            return { items: items.length > 0 ? items : starters, query };
        }
        catch {
            return { items: starters, query };
        }
    }, [gateway, sessionId, cwd]);
    const toItem = useCallback((entry, index) => {
        const classified = classify(entry);
        const metadata = {
            icon: classified.type,
            display: classified.display,
            meta: classified.meta,
            rawText: entry.text,
            insertId: classified.insertId
        };
        return {
            // Unique id keyed on the gateway's full `text` so two entries that share
            // a basename (e.g. multiple `index.ts`) don't collide in keyboard nav.
            id: `${entry.text}|${index}`,
            type: classified.type,
            label: classified.display,
            ...(classified.meta ? { description: classified.meta } : {}),
            metadata
        };
    }, []);
    return useLiveCompletionAdapter({ enabled, fetcher, toItem });
}
/** Re-export `classify` for use by the formatter (insertion side). */
export { classify };
