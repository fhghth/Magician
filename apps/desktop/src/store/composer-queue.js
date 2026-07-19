import { atom } from 'nanostores';
const STORAGE_KEY = 'hermes.desktop.composerQueue.v1';
const load = () => {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
};
const save = (state) => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        if (Object.keys(state).length === 0) {
            window.localStorage.removeItem(STORAGE_KEY);
        }
        else {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
    }
    catch {
        // best-effort: storage may be unavailable, queue still works in-memory
    }
};
export const $queuedPromptsBySession = atom(load());
const writeSession = (sid, queue) => {
    const current = $queuedPromptsBySession.get();
    const next = { ...current };
    if (queue.length === 0) {
        delete next[sid];
    }
    else {
        next[sid] = queue;
    }
    $queuedPromptsBySession.set(next);
    save(next);
};
const sidOf = (key) => {
    const trimmed = key?.trim();
    return trimmed ? trimmed : null;
};
const queueFor = (sid) => $queuedPromptsBySession.get()[sid] ?? [];
const nextId = () => `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const cloneAttachments = (attachments) => attachments.map(a => ({ ...a }));
export const getQueuedPrompts = (key) => {
    const sid = sidOf(key);
    return sid ? queueFor(sid) : [];
};
export const enqueueQueuedPrompt = (key, payload) => {
    const sid = sidOf(key);
    if (!sid) {
        return null;
    }
    const entry = {
        id: nextId(),
        text: payload.text,
        attachments: cloneAttachments(payload.attachments),
        queuedAt: Date.now()
    };
    writeSession(sid, [...queueFor(sid), entry]);
    return entry;
};
export const dequeueQueuedPrompt = (key) => {
    const sid = sidOf(key);
    if (!sid) {
        return null;
    }
    const [head, ...rest] = queueFor(sid);
    if (!head) {
        return null;
    }
    writeSession(sid, rest);
    return head;
};
export const removeQueuedPrompt = (key, id) => {
    const sid = sidOf(key);
    if (!sid) {
        return false;
    }
    const queue = queueFor(sid);
    const next = queue.filter(e => e.id !== id);
    if (next.length === queue.length) {
        return false;
    }
    writeSession(sid, next);
    return true;
};
export const promoteQueuedPrompt = (key, id) => {
    const sid = sidOf(key);
    if (!sid) {
        return false;
    }
    const queue = queueFor(sid);
    const index = queue.findIndex(e => e.id === id);
    if (index <= 0) {
        return false;
    }
    const entry = queue[index];
    writeSession(sid, [entry, ...queue.slice(0, index), ...queue.slice(index + 1)]);
    return true;
};
export const updateQueuedPrompt = (key, id, update) => {
    const sid = sidOf(key);
    if (!sid) {
        return false;
    }
    const queue = queueFor(sid);
    let changed = false;
    const next = queue.map(entry => {
        if (entry.id !== id) {
            return entry;
        }
        const attachments = update.attachments ? cloneAttachments(update.attachments) : entry.attachments;
        if (entry.text === update.text && !update.attachments) {
            return entry;
        }
        changed = true;
        return { ...entry, text: update.text, attachments };
    });
    if (!changed) {
        return false;
    }
    writeSession(sid, next);
    return true;
};
export const updateQueuedPromptText = (key, id, text) => updateQueuedPrompt(key, id, { text });
export const clearQueuedPrompts = (key) => {
    const sid = sidOf(key);
    if (!sid || !(sid in $queuedPromptsBySession.get())) {
        return;
    }
    writeSession(sid, []);
};
/**
 * Move pending entries from a dead session key onto a live one, preserving FIFO
 * (existing target entries first, migrated entries appended). A backend bounce /
 * resume can mint a fresh runtime session id for the *same* conversation; the
 * entries enqueued under the old id would otherwise be stranded under a key
 * nothing reads anymore. No-op unless both keys resolve and differ.
 */
export const migrateQueuedPrompts = (fromKey, toKey) => {
    const from = sidOf(fromKey);
    const to = sidOf(toKey);
    if (!from || !to || from === to) {
        return false;
    }
    const pending = queueFor(from);
    if (pending.length === 0) {
        return false;
    }
    const next = { ...$queuedPromptsBySession.get() };
    delete next[from];
    next[to] = [...queueFor(to), ...pending];
    $queuedPromptsBySession.set(next);
    save(next);
    return true;
};
/**
 * Decide whether the composer should auto-drain the next queued prompt.
 *
 * Edge-independent on purpose: the queue must advance whenever the session is
 * idle and has pending entries, NOT only on an observed busy true → false edge.
 * A backend bounce / websocket reconnect remounts the composer and resets the
 * busy ref to the current value, swallowing the settle edge — an edge-gated
 * drain would then strand the entry forever. The caller's drain lock
 * (`drainingQueueRef`) serializes sends so being edge-free can't double-submit.
 */
export const shouldAutoDrain = ({ isBusy, queueLength }) => !isBusy && queueLength > 0;
/** Auto-drain attempts for one entry before we stop retrying and toast. The
 * entry stays queued for a manual send; a remount/reconnect resets the count. */
export const MAX_AUTO_DRAIN_ATTEMPTS = 4;
