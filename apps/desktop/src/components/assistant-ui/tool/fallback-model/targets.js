export function looksLikeUrl(value) {
    return /^https?:\/\//i.test(value);
}
export function looksLikePath(value) {
    return /^file:\/\//i.test(value) || /^(?:\/|\.{1,2}\/|~\/).+/.test(value);
}
export function isPreviewableTarget(target) {
    return Boolean(target &&
        (/^file:\/\//i.test(target) ||
            /^(?:\/|\.{1,2}\/|~\/).+\.html?$/i.test(target) ||
            /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(target)));
}
export function stableHash(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(31, hash) + value.charCodeAt(index);
    }
    return Math.abs(hash).toString(36);
}
export function toolPartDisclosureId(part) {
    if (part.toolCallId) {
        return `tool:${part.toolCallId}`;
    }
    return `tool:${part.toolName}:${stableHash(JSON.stringify(part.args ?? ''))}`;
}
export function toolGroupDisclosureId(parts) {
    return `tool-group:${parts.map(toolPartDisclosureId).join('|')}`;
}
export const URL_PATTERN = /https?:\/\/[^\s'"<>)\]]+/i;
export function findFirstUrl(...sources) {
    for (const src of sources) {
        if (typeof src === 'string') {
            const m = src.match(URL_PATTERN);
            if (m) {
                return m[0];
            }
        }
        else if (src && typeof src === 'object') {
            for (const v of Object.values(src)) {
                const found = findFirstUrl(v);
                if (found) {
                    return found;
                }
            }
        }
    }
    return '';
}
export function hostnameOf(value) {
    try {
        const url = new URL(value);
        return `${url.hostname}${url.pathname && url.pathname !== '/' ? url.pathname : ''}`;
    }
    catch {
        return value;
    }
}
