import { atom, computed } from 'nanostores';
import { defaultBindings, KEYBIND_ACTION_IDS, keybindAction } from '@/lib/keybinds/actions';
import { canonicalizeCombo } from '@/lib/keybinds/combo';
import { arraysEqual, persistString, storedString } from '@/lib/storage';
const STORAGE_KEY = 'hermes.desktop.keybinds';
// Defaults overlaid with the user's stored overrides. Unknown / stale action ids
// are dropped; actions added in a later release pick up their shipped default.
function loadBindings() {
    const base = defaultBindings();
    const raw = storedString(STORAGE_KEY);
    if (!raw) {
        return base;
    }
    try {
        const parsed = JSON.parse(raw);
        for (const id of KEYBIND_ACTION_IDS) {
            const value = parsed[id];
            if (Array.isArray(value)) {
                base[id] = value.filter((combo) => typeof combo === 'string');
            }
        }
    }
    catch {
        // Corrupt storage falls back to defaults.
    }
    return base;
}
// Persist only the actions whose combos differ from their shipped default, so
// changing a default never gets shadowed by a stored snapshot.
function persistBindings(bindings) {
    const defaults = defaultBindings();
    const diff = {};
    for (const id of KEYBIND_ACTION_IDS) {
        const current = bindings[id] ?? [];
        if (!arraysEqual(current, defaults[id] ?? [])) {
            diff[id] = current;
        }
    }
    persistString(STORAGE_KEY, JSON.stringify(diff));
}
export const $bindings = atom(loadBindings());
$bindings.subscribe(persistBindings);
// Reverse lookup combo → actionId for dispatch. First action wins on conflict;
// the panel/edit overlay surface conflicts so users can resolve them. Keys go
// through `canonicalizeCombo` so a `ctrl+…` binding resolves everywhere.
export const $comboIndex = computed($bindings, bindings => {
    const index = new Map();
    for (const id of KEYBIND_ACTION_IDS) {
        for (const combo of bindings[id] ?? []) {
            const key = canonicalizeCombo(combo);
            if (!index.has(key)) {
                index.set(key, id);
            }
        }
    }
    return index;
});
export function setBinding(actionId, combos) {
    if (!keybindAction(actionId)) {
        return;
    }
    $bindings.set({ ...$bindings.get(), [actionId]: [...combos] });
}
export function resetBinding(actionId) {
    const action = keybindAction(actionId);
    if (!action) {
        return;
    }
    $bindings.set({ ...$bindings.get(), [actionId]: [...action.defaults] });
}
export function resetAllBindings() {
    $bindings.set(defaultBindings());
}
// Other actions that already use `combo` (excluding `actionId` itself).
export function conflictsFor(actionId, combo) {
    const bindings = $bindings.get();
    return KEYBIND_ACTION_IDS.filter(id => id !== actionId && (bindings[id] ?? []).includes(combo));
}
// ── Capture ─────────────────────────────────────────────────────────────────
// `$capture` is the action currently listening for its next keypress (a panel
// row armed for rebinding). Session-only — never persisted.
export const $capture = atom(null);
export function beginCapture(actionId) {
    $capture.set(actionId);
}
export function endCapture() {
    $capture.set(null);
}
// ── Panel ───────────────────────────────────────────────────────────────────
export const $keybindPanelOpen = atom(false);
export function openKeybindPanel() {
    $keybindPanelOpen.set(true);
}
export function closeKeybindPanel() {
    $keybindPanelOpen.set(false);
    $capture.set(null);
}
export function toggleKeybindPanel() {
    if ($keybindPanelOpen.get()) {
        closeKeybindPanel();
    }
    else {
        openKeybindPanel();
    }
}
