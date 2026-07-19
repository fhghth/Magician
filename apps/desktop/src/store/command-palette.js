import { atom } from 'nanostores';
/** Whether the global command palette (Cmd/Ctrl+K) is currently open. */
export const $commandPaletteOpen = atom(false);
/** Optional nested page to open when the palette next opens (e.g. `pets`). */
export const $commandPalettePage = atom(null);
export function openCommandPalette() {
    $commandPaletteOpen.set(true);
}
/** Open the palette directly on a nested page (`theme`, `pets`, …). */
export function openCommandPalettePage(page) {
    $commandPalettePage.set(page);
    $commandPaletteOpen.set(true);
}
export function closeCommandPalette() {
    $commandPaletteOpen.set(false);
    $commandPalettePage.set(null);
}
export function setCommandPaletteOpen(open) {
    $commandPaletteOpen.set(open);
    if (!open) {
        $commandPalettePage.set(null);
    }
}
export function toggleCommandPalette() {
    $commandPaletteOpen.set(!$commandPaletteOpen.get());
}
