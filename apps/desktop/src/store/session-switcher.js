import { atom } from 'nanostores';
import { $selectedStoredSessionId, $sessions } from './session';
// Mac-style session switcher (^Tab). Quick tap jumps on keydown; the HUD opens
// only when Tab is held past REVEAL_MS or tapped again while Ctrl is down.
export const SWITCHER_REVEAL_MS = 220;
export const $switcherOpen = atom(false);
export const $switcherSessions = atom([]);
export const $switcherIndex = atom(0);
const wrap = (index, length) => ((index % length) + length) % length;
let pendingBrowse = false;
let revealTimer = null;
let tabHeld = false;
let closedAt = 0;
function clearRevealTimer() {
    if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
    }
}
function revealOverlay() {
    pendingBrowse = false;
    $switcherOpen.set(true);
}
function scheduleReveal() {
    clearRevealTimer();
    revealTimer = setTimeout(() => {
        revealTimer = null;
        if (pendingBrowse && tabHeld) {
            revealOverlay();
        }
    }, SWITCHER_REVEAL_MS);
}
export function onSwitcherTabDown() {
    tabHeld = true;
}
export function onSwitcherTabUp() {
    tabHeld = false;
    if (!$switcherOpen.get()) {
        clearRevealTimer();
    }
}
// First Tab returns a session id to jump to immediately; later Tabs move the
// highlight (Ctrl↑ commits when the HUD is open).
export function openOrAdvanceSwitcher(direction) {
    const sessions = $sessions.get();
    if (sessions.length < 2) {
        return null;
    }
    if ($switcherOpen.get()) {
        const { length } = $switcherSessions.get();
        if (length) {
            $switcherIndex.set(wrap($switcherIndex.get() + direction, length));
        }
        return null;
    }
    const current = sessions.findIndex(session => session.id === $selectedStoredSessionId.get());
    const start = current === -1 ? (direction === 1 ? -1 : 0) : current;
    const nextIndex = wrap(start + direction, sessions.length);
    $switcherSessions.set(sessions);
    $switcherIndex.set(nextIndex);
    if (pendingBrowse) {
        clearRevealTimer();
        $switcherIndex.set(wrap($switcherIndex.get() + direction, sessions.length));
        revealOverlay();
        return null;
    }
    pendingBrowse = true;
    scheduleReveal();
    return sessions[nextIndex]?.id ?? null;
}
export const highlightedSessionId = () => $switcherSessions.get()[$switcherIndex.get()]?.id ?? null;
export const slotSessionId = (slot) => ($switcherOpen.get() || pendingBrowse ? $switcherSessions.get() : $sessions.get())[slot - 1]?.id ?? null;
export function closeSwitcher() {
    closedAt = Date.now();
    clearRevealTimer();
    pendingBrowse = false;
    tabHeld = false;
    $switcherOpen.set(false);
}
export function commitOnCtrlUp() {
    clearRevealTimer();
    pendingBrowse = false;
    if (!$switcherOpen.get()) {
        return null;
    }
    const target = highlightedSessionId();
    closeSwitcher();
    return target;
}
export const switcherJustClosed = () => Date.now() - closedAt < 400;
export const switcherActive = () => $switcherOpen.get() || pendingBrowse;
