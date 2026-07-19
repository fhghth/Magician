import { atom } from 'nanostores';
const $perSessionBrowse = atom({});
function ensure(sessionId) {
    const all = { ...$perSessionBrowse.get() };
    let s = all[sessionId];
    if (!s) {
        s = { cursor: -1, draftSnapshot: '' };
        all[sessionId] = s;
        $perSessionBrowse.set(all);
    }
    return s;
}
function persist() {
    $perSessionBrowse.set({ ...$perSessionBrowse.get() });
}
function valid(sessionId) {
    return typeof sessionId === 'string' && sessionId.length > 0;
}
/**
 * Derive the user-text ring (newest first) from session messages.
 * The caller is responsible for providing already-session-scoped messages.
 */
export function deriveUserHistory(messages, getText) {
    const out = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role !== 'user') {
            continue;
        }
        const t = getText(m).trim();
        if (t) {
            out.push(t);
        }
    }
    return out;
}
/**
 * Start browsing backward, or step to the next older entry.
 * Returns the text to place in the composer, or null if already at the oldest
 * entry (or the ring is empty).
 */
export function browseBackward(sessionId, currentDraft, history) {
    if (!valid(sessionId) || history.length === 0) {
        return null;
    }
    const s = ensure(sessionId);
    if (s.cursor === -1) {
        s.draftSnapshot = currentDraft;
        s.cursor = 0;
    }
    else if (s.cursor < history.length - 1) {
        s.cursor += 1;
    }
    else {
        return null;
    }
    persist();
    return history[s.cursor];
}
/**
 * Browse forward toward the present. When reaching the "newest" entry the
 * saved draft is restored and the cursor resets.
 */
export function browseForward(sessionId, history) {
    if (!valid(sessionId)) {
        return null;
    }
    const s = ensure(sessionId);
    if (s.cursor === -1) {
        return null;
    }
    if (s.cursor > 0) {
        s.cursor -= 1;
        persist();
        return { text: history[s.cursor], returnedToPresent: false };
    }
    // At newest; moving forward restores the saved draft.
    const text = s.draftSnapshot;
    s.cursor = -1;
    s.draftSnapshot = '';
    persist();
    return { text, returnedToPresent: true };
}
/** Clear browse state for a session (e.g. on session switch or new submit). */
export function resetBrowseState(sessionId) {
    if (!valid(sessionId)) {
        return;
    }
    const all = { ...$perSessionBrowse.get() };
    const existing = all[sessionId];
    if (!existing) {
        return;
    }
    all[sessionId] = { cursor: -1, draftSnapshot: '' };
    $perSessionBrowse.set(all);
}
/** True if the user is currently browsing history for this session. */
export function isBrowsingHistory(sessionId) {
    if (!valid(sessionId)) {
        return false;
    }
    const s = $perSessionBrowse.get()[sessionId];
    return s ? s.cursor >= 0 : false;
}
export { $perSessionBrowse };
