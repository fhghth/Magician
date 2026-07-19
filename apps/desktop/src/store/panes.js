import { atom, computed } from 'nanostores';
const STORAGE_KEY = 'hermes.desktop.paneStates.v1';
function isSnapshot(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const r = value;
    if (typeof r.open !== 'boolean') {
        return false;
    }
    const widthOk = r.widthOverride === undefined || (typeof r.widthOverride === 'number' && Number.isFinite(r.widthOverride));
    const heightOk = r.heightOverride === undefined || (typeof r.heightOverride === 'number' && Number.isFinite(r.heightOverride));
    return widthOk && heightOk;
}
function load() {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const out = {};
                for (const [id, value] of Object.entries(parsed)) {
                    if (isSnapshot(value)) {
                        out[id] = { open: value.open, widthOverride: value.widthOverride, heightOverride: value.heightOverride };
                    }
                }
                return out;
            }
        }
    }
    catch {
        // Treat unparseable persisted state as missing.
    }
    return {};
}
// Persists both open state and resize width; load() validates each snapshot.
function persist(states) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    }
    catch {
        // Storage failures are nonfatal.
    }
}
export const $paneStates = atom(load());
$paneStates.subscribe(persist);
// Cached per-pane derived atoms keep useStore subscriptions referentially stable.
function memoized(cache, id, selector) {
    let cached = cache.get(id);
    if (!cached) {
        cached = computed($paneStates, states => selector(states[id]));
        cache.set(id, cached);
    }
    return cached;
}
const openCache = new Map();
const stateCache = new Map();
const widthCache = new Map();
const heightCache = new Map();
export const $paneOpen = (id) => memoized(openCache, id, s => s?.open ?? false);
export const $paneState = (id) => memoized(stateCache, id, s => s);
export const $paneWidthOverride = (id) => memoized(widthCache, id, s => s?.widthOverride);
export const $paneHeightOverride = (id) => memoized(heightCache, id, s => s?.heightOverride);
export function ensurePaneRegistered(id, defaults) {
    const current = $paneStates.get();
    if (current[id] !== undefined) {
        return;
    }
    $paneStates.set({ ...current, [id]: { open: defaults.open, widthOverride: defaults.widthOverride } });
}
export function setPaneOpen(id, open) {
    const current = $paneStates.get();
    const existing = current[id];
    if (existing?.open === open) {
        return;
    }
    $paneStates.set({ ...current, [id]: { ...existing, open } });
}
export function togglePane(id) {
    const current = $paneStates.get();
    const existing = current[id];
    $paneStates.set({ ...current, [id]: { ...existing, open: !(existing?.open ?? false) } });
}
export function setPaneWidthOverride(id, width) {
    const current = $paneStates.get();
    const existing = current[id] ?? { open: false };
    if (existing.widthOverride === width) {
        return;
    }
    $paneStates.set({ ...current, [id]: { ...existing, widthOverride: width } });
}
export function setPaneHeightOverride(id, height) {
    const current = $paneStates.get();
    const existing = current[id] ?? { open: false };
    if (existing.heightOverride === height) {
        return;
    }
    $paneStates.set({ ...current, [id]: { ...existing, heightOverride: height } });
}
export const clearPaneWidthOverride = (id) => setPaneWidthOverride(id, undefined);
export const clearPaneHeightOverride = (id) => setPaneHeightOverride(id, undefined);
export const getPaneStateSnapshot = (id) => $paneStates.get()[id];
