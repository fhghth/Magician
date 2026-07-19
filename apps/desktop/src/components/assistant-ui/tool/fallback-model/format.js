export function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export function compactPreview(value, max = 72) {
    let raw;
    if (typeof value === 'string') {
        raw = value;
    }
    else {
        raw = parseMaybeObject(value).context;
    }
    if (typeof raw !== 'string') {
        if (raw == null) {
            raw = '';
        }
        else {
            try {
                raw = JSON.stringify(raw);
            }
            catch {
                raw = String(raw);
            }
        }
    }
    const line = raw.replace(/\s+/g, ' ').trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
export function contextValue(value) {
    const row = parseMaybeObject(value);
    if (typeof row.context === 'string') {
        return row.context;
    }
    if (typeof row.preview === 'string') {
        return row.preview;
    }
    return typeof value === 'string' ? value : '';
}
// Each tool result is server-capped (~100KB), but a turn over a big directory
// stacks many rows; painting/serializing them all floods the renderer (freeze,
// then OOM). Clamp every inline-painted payload to a bounded slice — the row's
// Copy button still reads the uncapped `view.detail` for the full output.
export const MAX_TOOL_RENDER_CHARS = 20_000;
export function clampForDisplay(value, max = MAX_TOOL_RENDER_CHARS) {
    if (value.length <= max) {
        return value;
    }
    const omitted = value.length - max;
    return `${value.slice(0, max)}\n\n… ${omitted.toLocaleString()} more characters truncated — use Copy for the full output.`;
}
export function prettyJson(value) {
    const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return clampForDisplay(raw ?? '');
}
export function parseMaybeObject(value) {
    if (isRecord(value)) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
export function unwrapToolPayload(value) {
    const record = parseMaybeObject(value);
    for (const key of ['data', 'result', 'output', 'response', 'payload']) {
        const payload = record[key];
        if (payload !== undefined && payload !== null) {
            return payload;
        }
    }
    return value;
}
export function numberValue(value) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}
export function formatDurationSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '';
    }
    if (seconds < 1) {
        const ms = Math.max(1, Math.round(seconds * 1000));
        return `${ms}ms`;
    }
    if (seconds < 60) {
        return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
    }
    const wholeSeconds = Math.round(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remSeconds = wholeSeconds % 60;
    if (minutes < 60) {
        return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}
