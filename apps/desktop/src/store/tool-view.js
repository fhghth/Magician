import { atom, computed } from 'nanostores';
import { persistBoolean, storedBoolean } from '@/lib/storage';
const TOOL_VIEW_TECHNICAL_STORAGE_KEY = 'hermes.desktop.toolView.technical';
const TOOL_DISCLOSURE_STORAGE_KEY = 'hermes.desktop.toolDisclosure.v1';
const MAX_DISCLOSURE_STATES = 240;
export const $toolViewMode = atom(storedBoolean(TOOL_VIEW_TECHNICAL_STORAGE_KEY, false) ? 'technical' : 'product');
export const $toolDisclosureStates = atom(loadToolDisclosureStates());
const disclosureOpenCache = new Map();
$toolViewMode.subscribe(mode => persistBoolean(TOOL_VIEW_TECHNICAL_STORAGE_KEY, mode === 'technical'));
$toolDisclosureStates.subscribe(persistToolDisclosureStates);
export function setToolViewMode(mode) {
    $toolViewMode.set(mode);
}
export function $toolDisclosureOpen(id) {
    let cached = disclosureOpenCache.get(id);
    if (!cached) {
        cached = computed($toolDisclosureStates, states => states[id]);
        disclosureOpenCache.set(id, cached);
    }
    return cached;
}
function loadToolDisclosureStates() {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(TOOL_DISCLOSURE_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        return Object.fromEntries(Object.entries(parsed)
            .filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'boolean')
            .slice(-MAX_DISCLOSURE_STATES));
    }
    catch {
        return {};
    }
}
function persistToolDisclosureStates(states) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const entries = Object.entries(states).slice(-MAX_DISCLOSURE_STATES);
        window.localStorage.setItem(TOOL_DISCLOSURE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    }
    catch {
        // Tool disclosure is a local UI preference; ignore storage failures.
    }
}
export function setToolDisclosureOpen(id, open) {
    if (!id) {
        return;
    }
    const current = $toolDisclosureStates.get();
    if (current[id] === open) {
        return;
    }
    $toolDisclosureStates.set({ ...current, [id]: open });
}
