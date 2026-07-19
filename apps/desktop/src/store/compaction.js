import { atom, computed } from 'nanostores';
import { $activeSessionId } from './session';
// Per-session flag while auto-compaction runs mid-turn. Without it the
// transcript looks like it reset; per-session so a background chat can't
// clobber the foreground view.
const keyFor = (sessionId) => sessionId ?? '';
export const $compactingSessions = atom({});
export const $compactionActive = computed([$compactingSessions, $activeSessionId], (sessions, activeId) => keyFor(activeId) in sessions);
export function setSessionCompacting(sessionId, active) {
    const key = keyFor(sessionId);
    const sessions = $compactingSessions.get();
    if (active) {
        if (key in sessions) {
            return;
        }
        $compactingSessions.set({ ...sessions, [key]: true });
        return;
    }
    if (!(key in sessions)) {
        return;
    }
    const next = { ...sessions };
    delete next[key];
    $compactingSessions.set(next);
}
