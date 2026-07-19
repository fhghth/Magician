import { asText } from '@/lib/text';
import { BUILTIN_PERSONALITIES, ENUM_OPTIONS, PROVIDER_GROUPS } from './constants';
// Canonical implementations live in @/lib/text; re-exported here so the many
// settings/capabilities call sites keep their import path.
export { asText, includesQuery, prettyName } from '@/lib/text';
/** Strip leading emoji from toolset titles (CLI registry prefixes labels with icons). */
export const stripToolsetLabel = (label) => label.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s]+/u, '').trim() || label;
export const toolsetDisplayLabel = (toolset) => stripToolsetLabel(asText(toolset.label || toolset.name));
export const toolNames = (t) => (Array.isArray(t.tools) ? t.tools.map(asText).filter(Boolean) : []);
export const withoutKey = (record, key) => {
    const next = { ...record };
    delete next[key];
    return next;
};
export const redactedValue = (v) => (v.length <= 8 ? '••••' : `${v.slice(0, 4)}...${v.slice(-4)}`);
// Longest-prefix match so a more specific group like ``MINIMAX_CN_`` is
// chosen over its shorter parent ``MINIMAX_``. Falls back to the bucket
// "Other" used by the Keys settings view for un-grouped env vars.
export const providerGroup = (key) => {
    let best;
    for (const candidate of PROVIDER_GROUPS) {
        if (!key.startsWith(candidate.prefix)) {
            continue;
        }
        if (!best || candidate.prefix.length > best.prefix.length) {
            best = candidate;
        }
    }
    return best?.name ?? 'Other';
};
export const providerMeta = (name) => PROVIDER_GROUPS.find(g => g.name === name && (g.description || g.docsUrl)) ??
    PROVIDER_GROUPS.find(g => g.name === name);
export const providerPriority = (name) => providerMeta(name)?.priority ?? 99;
const POLLUTING_PATH_PARTS = new Set(['__proto__', 'constructor', 'prototype']);
function isSafePart(part) {
    return part.length > 0 && !POLLUTING_PATH_PARTS.has(part);
}
function configPathParts(path) {
    const parts = path.split('.');
    if (!parts.every(isSafePart)) {
        throw new Error(`Unsafe config path: ${path}`);
    }
    return parts;
}
function safeSet(target, key, value) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !key) {
        throw new Error(`Unsafe config key: ${key}`);
    }
    Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
    });
}
export function getNested(obj, path) {
    let cur = obj;
    for (const part of configPathParts(path)) {
        if (cur == null || typeof cur !== 'object') {
            return undefined;
        }
        if (!Object.prototype.hasOwnProperty.call(cur, part)) {
            return undefined;
        }
        cur = cur[part];
    }
    return cur;
}
export function setNested(obj, path, value) {
    const clone = structuredClone(obj);
    const parts = configPathParts(path);
    let cur = clone;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (!isSafePart(part)) {
            throw new Error(`Unsafe config path part: ${part}`);
        }
        const existing = Object.prototype.hasOwnProperty.call(cur, part) ? cur[part] : undefined;
        if (existing == null || typeof existing !== 'object') {
            safeSet(cur, part, {});
        }
        cur = cur[part];
    }
    safeSet(cur, parts[parts.length - 1], value);
    return clone;
}
function personalityOptions(config) {
    const custom = getNested(config, 'agent.personalities');
    const customNames = custom && typeof custom === 'object' && !Array.isArray(custom) ? Object.keys(custom) : [];
    return [...new Set(['', ...BUILTIN_PERSONALITIES, ...customNames])];
}
export function enumOptionsFor(key, value, config, dynamicOptions) {
    const opts = dynamicOptions ?? (key === 'display.personality' ? personalityOptions(config) : ENUM_OPTIONS[key]);
    if (!opts) {
        return undefined;
    }
    const current = asText(value);
    return current && !opts.includes(current) ? [...opts, current] : opts;
}
