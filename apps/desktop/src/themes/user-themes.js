/**
 * User-installed desktop themes (currently: converted VS Code themes).
 *
 * This is the extensibility seam. The theme context reads the *merged* registry
 * (built-ins + user themes) for `availableThemes` and for every skin lookup, so
 * an installed theme shows up everywhere a built-in does — the Cmd-K palette,
 * the Appearance settings grid, and `/skin` — with no per-surface wiring.
 *
 * Stored as a localStorage record so the boot-time paint (which runs before
 * React mounts) can resolve a user theme synchronously, same as built-ins.
 */
import { atom, computed } from 'nanostores';
import { BUILTIN_THEMES } from './presets';
const USER_THEMES_KEY = 'hermes-desktop-user-themes-v1';
// Marketplace imports stamp their description "VS Code · <publisher.extension>"
// (see `convertVscodeColorTheme`). This is the one place that convention is read
// back out, so every install surface can tell what's already installed.
const MARKETPLACE_DESC_PREFIX = 'VS Code · ';
// The minimal set of color keys a stored theme must carry to be usable. We keep
// this loose — `applyTheme` tolerates missing optionals via fallbacks — but a
// theme with no background/foreground/primary is junk and gets dropped.
const REQUIRED_COLOR_KEYS = ['background', 'foreground', 'primary'];
function isValidTheme(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const theme = value;
    if (typeof theme.name !== 'string' || typeof theme.label !== 'string' || !theme.colors) {
        return false;
    }
    const colors = theme.colors;
    return REQUIRED_COLOR_KEYS.every(key => typeof colors[key] === 'string');
}
function readStored() {
    try {
        const raw = window.localStorage.getItem(USER_THEMES_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const out = {};
        for (const [key, value] of Object.entries(parsed)) {
            // Never let a stored theme shadow a built-in name.
            if (!BUILTIN_THEMES[key] && isValidTheme(value)) {
                out[key] = value;
            }
        }
        return out;
    }
    catch {
        return {};
    }
}
function persist(record) {
    try {
        window.localStorage.setItem(USER_THEMES_KEY, JSON.stringify(record));
    }
    catch {
        // Best-effort: a restricted storage context shouldn't break theming.
    }
}
/** Reactive map of installed user themes, keyed by slug. */
export const $userThemes = atom(typeof window === 'undefined' ? {} : readStored());
/** Install (or replace) a user theme. Returns the stored theme. */
export function installUserTheme(theme) {
    if (BUILTIN_THEMES[theme.name]) {
        throw new Error(`"${theme.name}" collides with a built-in theme.`);
    }
    if (!isValidTheme(theme)) {
        throw new Error('Theme is missing required colors.');
    }
    const next = { ...$userThemes.get(), [theme.name]: theme };
    $userThemes.set(next);
    persist(next);
    return theme;
}
/** Remove a user theme by slug. No-op for unknown / built-in names. */
export function removeUserTheme(name) {
    const current = $userThemes.get();
    if (!current[name]) {
        return;
    }
    const next = { ...current };
    delete next[name];
    $userThemes.set(next);
    persist(next);
}
export const isUserTheme = (name) => Boolean($userThemes.get()[name]);
/** The Marketplace extension id an installed theme came from, or null. */
export function marketplaceIdOf(theme) {
    return theme.description.startsWith(MARKETPLACE_DESC_PREFIX)
        ? theme.description.slice(MARKETPLACE_DESC_PREFIX.length)
        : null;
}
/**
 * Reactive `extensionId → installed theme` map, so the install UIs can mark
 * Marketplace rows you already have (and re-activate them without re-downloading)
 * from one memoized source instead of re-deriving the set on every render.
 */
export const $marketplaceInstalls = computed($userThemes, themes => {
    const map = new Map();
    for (const theme of Object.values(themes)) {
        const id = marketplaceIdOf(theme);
        if (id) {
            map.set(id, theme);
        }
    }
    return map;
});
/** Resolve a theme by name across the merged registry (built-in + user). */
export function resolveTheme(name) {
    return BUILTIN_THEMES[name] ?? $userThemes.get()[name];
}
/** Built-ins first (stable order), then user themes by install order. */
export function listAllThemes() {
    return [...Object.values(BUILTIN_THEMES), ...Object.values($userThemes.get())];
}
