// ── Persistence choke point ─────────────────────────────────────────────────
// Every persisted read/write in the app funnels through readKey/writeKey, so a
// single subscriber (telemetry, cross-window sync, an audit log) can observe all
// of it without instrumenting each call site. No listeners by default → no cost.
const persistenceListeners = new Set();
/** Observe every persisted get/set (e.g. pipe into telemetry/sync). */
export function onPersistenceEvent(listener) {
    persistenceListeners.add(listener);
    return () => void persistenceListeners.delete(listener);
}
function emitPersistence(event) {
    for (const listener of persistenceListeners) {
        listener(event);
    }
}
/** Raw read. Returns null when absent or storage is unavailable. */
export function readKey(key) {
    let value = null;
    try {
        value = window.localStorage.getItem(key);
    }
    catch {
        // Restricted contexts (private mode, disabled storage) read as absent.
    }
    emitPersistence({ key, op: 'read', value });
    return value;
}
/** Raw write. A null value removes the key. Best-effort. */
export function writeKey(key, value) {
    try {
        if (value === null) {
            window.localStorage.removeItem(key);
        }
        else {
            window.localStorage.setItem(key, value);
        }
    }
    catch {
        // Storage is best-effort; never let a quota/permission error break the UI.
    }
    emitPersistence({ key, op: value === null ? 'remove' : 'write', value });
}
export function storedBoolean(key, fallback) {
    const value = readKey(key);
    return value === null ? fallback : value === 'true';
}
export function persistBoolean(key, value) {
    writeKey(key, String(value));
}
export function storedString(key) {
    return readKey(key);
}
export function persistString(key, value) {
    writeKey(key, value);
}
export function storedStringArray(key) {
    const value = readKey(key);
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item) => typeof item === 'string' && item.length > 0);
    }
    catch {
        return [];
    }
}
export function persistStringArray(key, value) {
    writeKey(key, value.length === 0 ? null : JSON.stringify(value));
}
export function storedStringRecord(key) {
    const value = readKey(key);
    if (!value) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === 'string'));
    }
    catch {
        return {};
    }
}
export function persistStringRecord(key, value) {
    writeKey(key, JSON.stringify(value));
}
export function arraysEqual(left, right) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}
export function insertUniqueId(ids, id, index) {
    const next = ids.filter(item => item !== id);
    const boundedIndex = Math.min(Math.max(index, 0), next.length);
    next.splice(boundedIndex, 0, id);
    return next;
}
