import { atom, computed } from 'nanostores';
import { translateNow } from '@/i18n';
import { $gateway } from './gateway';
import { dispatchNativeNotification } from './native-notifications';
import { notifyError } from './notifications';
import { $subagentsBySession } from './subagents';
import { $todosBySession } from './todos';
// Writable source for background work, synced from the gateway's process
// registry (`terminal(background=true)` spawns) via `process.list`.
export const $backgroundStatusBySession = atom({});
// Rows the user X-ed away. The registry keeps finished processes around for a
// while, so without this every refresh would resurrect a dismissed row.
const dismissedBySession = new Map();
// Finished tasks self-clear so the stack only ever holds running work. Success
// goes quick; failure lingers longer so its exit code stays readable (the output
// also lives in the transcript). A manual X still drops either at once.
const SUCCESS_LINGER_MS = 4_000;
const FAILURE_LINGER_MS = 12_000;
const autoClearTimers = new Map();
function scheduleAutoDismiss(sid, id, delayMs) {
    let timers = autoClearTimers.get(sid);
    if (timers?.has(id)) {
        return;
    }
    if (!timers) {
        timers = new Map();
        autoClearTimers.set(sid, timers);
    }
    timers.set(id, setTimeout(() => {
        autoClearTimers.get(sid)?.delete(id);
        dismissBackgroundProcess(sid, id);
    }, delayMs));
}
function cancelAutoDismiss(sid, id) {
    const timers = autoClearTimers.get(sid);
    if (!timers) {
        return;
    }
    const timer = timers.get(id);
    if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(id);
    }
}
function cancelAllAutoDismiss(sid) {
    const timers = autoClearTimers.get(sid);
    if (!timers) {
        return;
    }
    for (const timer of timers.values()) {
        clearTimeout(timer);
    }
    autoClearTimers.delete(sid);
}
const subToItem = (s) => ({
    currentTool: s.currentTool,
    id: s.id,
    sessionId: s.sessionId,
    state: 'running',
    title: s.goal,
    type: 'subagent'
});
const todoToItem = (t) => ({
    id: `todo:${t.id}`,
    state: t.status === 'in_progress' ? 'running' : 'done',
    title: t.content,
    todoStatus: t.status,
    type: 'todo'
});
// The single thing the stack reads: a typed, merged item list per session.
export const $statusItemsBySession = computed([$subagentsBySession, $backgroundStatusBySession, $todosBySession], (subs, background, todos) => {
    const out = {};
    const push = (sid, items) => {
        if (items.length > 0) {
            out[sid] = out[sid] ? [...out[sid], ...items] : items;
        }
    };
    for (const [sid, list] of Object.entries(todos)) {
        push(sid, list.map(todoToItem));
    }
    for (const [sid, list] of Object.entries(subs)) {
        push(sid, list.filter(s => s.status === 'running' || s.status === 'queued').map(subToItem));
    }
    for (const [sid, list] of Object.entries(background)) {
        push(sid, list);
    }
    return out;
});
// Fixed render order for the groups in the stack (top → bottom, above queue).
const TYPE_ORDER = ['todo', 'subagent', 'background'];
export function groupStatusItems(items) {
    const byType = new Map();
    for (const item of items) {
        const list = byType.get(item.type);
        if (list) {
            list.push(item);
        }
        else {
            byType.set(item.type, [item]);
        }
    }
    return TYPE_ORDER.filter(type => byType.has(type)).map(type => ({ items: byType.get(type), type }));
}
const writeBackground = (sid, items) => {
    const current = $backgroundStatusBySession.get();
    const next = { ...current };
    if (items.length > 0) {
        next[sid] = items;
    }
    else {
        delete next[sid];
    }
    $backgroundStatusBySession.set(next);
};
const toBackgroundItem = (proc) => {
    const exited = proc.status === 'exited';
    const exitCode = typeof proc.exit_code === 'number' ? proc.exit_code : undefined;
    return {
        exitCode,
        id: proc.session_id ?? '',
        output: proc.output_tail || undefined,
        state: exited ? (exitCode ? 'failed' : 'done') : 'running',
        title: (proc.command ?? '').split('\n')[0].trim() || 'background process',
        type: 'background'
    };
};
const sameItem = (a, b) => a.state === b.state && a.title === b.title && a.output === b.output && a.exitCode === b.exitCode;
/**
 * Layout-stable sync of the registry snapshot into the store: existing rows
 * keep their position (status flips happen in place, never reorder), new
 * processes append, dismissed ids stay gone, and unchanged rows keep their
 * object identity so memoised rows skip re-rendering.
 */
export function reconcileBackgroundProcesses(sid, procs) {
    const dismissed = dismissedBySession.get(sid);
    const fresh = new Map(procs
        .filter(proc => proc.session_id && !dismissed?.has(proc.session_id))
        .map(proc => [proc.session_id, toBackgroundItem(proc)]));
    const prev = $backgroundStatusBySession.get()[sid] ?? [];
    // running → exited since the last snapshot = a background process just finished.
    const prevState = new Map(prev.map(item => [item.id, item.state]));
    for (const [id, item] of fresh) {
        if (item.state !== 'running' && prevState.get(id) === 'running') {
            dispatchNativeNotification({
                body: item.title,
                kind: 'backgroundDone',
                sessionId: sid,
                title: translateNow(item.state === 'failed'
                    ? 'notifications.native.backgroundFailedTitle'
                    : 'notifications.native.backgroundDoneTitle')
            });
        }
    }
    const kept = prev.flatMap(old => {
        const next = fresh.get(old.id);
        fresh.delete(old.id);
        return next ? [sameItem(old, next) ? old : next] : [];
    });
    const next = [...kept, ...fresh.values()];
    // Dismissals only need remembering while the registry still reports the id.
    if (dismissed) {
        const reported = new Set(procs.map(proc => proc.session_id));
        for (const id of dismissed) {
            if (!reported.has(id)) {
                dismissed.delete(id);
            }
        }
    }
    // Arm the self-clear on every finished task (failures linger longer); cancel
    // it for anything running again or gone from the snapshot.
    const finishedDelay = new Map(next
        .filter(item => item.state !== 'running')
        .map(item => [item.id, item.state === 'failed' ? FAILURE_LINGER_MS : SUCCESS_LINGER_MS]));
    for (const [id, delay] of finishedDelay) {
        scheduleAutoDismiss(sid, id, delay);
    }
    for (const id of [...(autoClearTimers.get(sid)?.keys() ?? [])]) {
        if (!finishedDelay.has(id)) {
            cancelAutoDismiss(sid, id);
        }
    }
    if (next.length === prev.length && next.every((item, i) => item === prev[i])) {
        return;
    }
    writeBackground(sid, next);
}
/** Pull the session's live process snapshot from the gateway. */
export async function refreshBackgroundProcesses(sid) {
    const gateway = $gateway.get();
    if (!sid || !gateway) {
        return;
    }
    try {
        const result = await gateway.request('process.list', { session_id: sid });
        reconcileBackgroundProcesses(sid, result?.processes ?? []);
    }
    catch {
        // Transient socket loss — the next trigger (event or poll) retries.
    }
}
/** X on a finished row: drop it now and keep it dropped across refreshes. */
export function dismissBackgroundProcess(sid, id) {
    cancelAutoDismiss(sid, id);
    const dismissed = dismissedBySession.get(sid) ?? new Set();
    dismissed.add(id);
    dismissedBySession.set(sid, dismissed);
    const list = $backgroundStatusBySession.get()[sid] ?? [];
    writeBackground(sid, list.filter(item => item.id !== id));
}
/** X on a running row: kill the process for real, THEN drop the row. Only drop
 *  on a confirmed kill — dismissing unconditionally (the old behavior) hid the
 *  row while the process lived on, stranding rogue tasks. On failure the row
 *  stays so the user can retry / see it didn't die. */
export async function stopBackgroundProcess(sid, id) {
    try {
        await $gateway.get()?.request('process.kill', { process_id: id, session_id: sid });
        dismissBackgroundProcess(sid, id);
    }
    catch (err) {
        notifyError(err, 'Could not stop the process');
    }
}
/**
 * Rewind cleanup: a restore/edit discards the turns that spawned these
 * processes, so they belong to an abandoned timeline. Kill the live ones and
 * drop every row. Ids are marked dismissed so an in-flight `process.list` poll
 * (kill is async) can't resurrect them; reconcile garbage-collects those once
 * the registry stops reporting them.
 */
export function resetSessionBackground(sid) {
    if (!sid) {
        return;
    }
    cancelAllAutoDismiss(sid);
    const gateway = $gateway.get();
    const list = $backgroundStatusBySession.get()[sid] ?? [];
    const dismissed = dismissedBySession.get(sid) ?? new Set();
    for (const item of list) {
        dismissed.add(item.id);
        if (item.state === 'running') {
            void gateway?.request('process.kill', { process_id: item.id, session_id: sid }).catch(() => undefined);
        }
    }
    dismissedBySession.set(sid, dismissed);
    writeBackground(sid, []);
}
