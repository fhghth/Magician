import { atom } from 'nanostores';
import { persistString, storedString } from '@/lib/storage';
import { $gateway } from './gateway';
import { clearApprovalRequest } from './prompts';
import { $activeSessionId } from './session';
export const NATIVE_NOTIFICATION_KINDS = [
    'approval',
    'input',
    'turnDone',
    'turnError',
    'backgroundDone'
];
// Blocking prompts — surface even while focused if they're for another session.
const ATTENTION_KINDS = new Set(['approval', 'input']);
const STORAGE_KEY = 'hermes:native-notifications';
const DEFAULT_PREFS = {
    enabled: true,
    kinds: { approval: true, backgroundDone: true, input: true, turnDone: true, turnError: true }
};
function readPrefs() {
    const raw = storedString(STORAGE_KEY);
    if (!raw) {
        return DEFAULT_PREFS;
    }
    try {
        const parsed = JSON.parse(raw);
        const kinds = { ...DEFAULT_PREFS.kinds };
        for (const kind of NATIVE_NOTIFICATION_KINDS) {
            const value = parsed.kinds?.[kind];
            if (typeof value === 'boolean') {
                kinds[kind] = value;
            }
        }
        return {
            enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFS.enabled,
            kinds
        };
    }
    catch {
        return DEFAULT_PREFS;
    }
}
export const $nativeNotifyPrefs = atom(readPrefs());
function writePrefs(next) {
    $nativeNotifyPrefs.set(next);
    persistString(STORAGE_KEY, JSON.stringify(next));
}
export function setNativeNotifyEnabled(enabled) {
    writePrefs({ ...$nativeNotifyPrefs.get(), enabled });
}
export function setNativeNotifyKind(kind, on) {
    const prev = $nativeNotifyPrefs.get();
    writePrefs({ ...prev, kinds: { ...prev.kinds, [kind]: on } });
}
// De-dupe replayed events for the same kind+session. Self-evicting: entries
// older than the window are pruned on every dispatch, so the map can't grow.
const THROTTLE_MS = 1000;
const lastFiredAt = new Map();
function throttled(key, now) {
    for (const [k, at] of lastFiredAt) {
        if (now - at >= THROTTLE_MS) {
            lastFiredAt.delete(k);
        }
    }
    if (lastFiredAt.has(key)) {
        return true;
    }
    lastFiredAt.set(key, now);
    return false;
}
// "Backgrounded" = the user isn't on Hermes. `document.hidden` only flips when
// minimized/occluded; an alt-tabbed window is visible-but-unfocused, so we also
// check `document.hasFocus()`.
function isBackgrounded() {
    if (typeof document === 'undefined') {
        return false;
    }
    if (document.hidden) {
        return true;
    }
    return typeof document.hasFocus === 'function' && !document.hasFocus();
}
function shouldFire(kind, sessionId, global = false) {
    // Global notifications aren't tied to a chat session (e.g. pet generation,
    // which runs from the command center with no active conversation). They fire
    // whenever the user is away, with no session-match requirement — otherwise a
    // background run started without an open session would be silently dropped.
    if (global) {
        return isBackgrounded();
    }
    // Attention kinds break through for an off-screen session even while focused.
    if (ATTENTION_KINDS.has(kind)) {
        return isBackgrounded() || (Boolean(sessionId) && sessionId !== $activeSessionId.get());
    }
    // Completion kinds: only the active session, only while away — so a busy
    // gateway (messaging, kanban, cron) can't spam a toast per background session.
    return isBackgrounded() && Boolean(sessionId) && sessionId === $activeSessionId.get();
}
export function dispatchNativeNotification(input) {
    const prefs = $nativeNotifyPrefs.get();
    if (!prefs.enabled || !prefs.kinds[input.kind]) {
        return;
    }
    if (!shouldFire(input.kind, input.sessionId, input.global)) {
        return;
    }
    if (throttled(`${input.kind}:${input.sessionId ?? (input.global ? 'global' : '')}`, Date.now())) {
        return;
    }
    void window.hermesDesktop?.notify({
        actions: input.actions,
        body: input.body,
        kind: input.kind,
        sessionId: input.sessionId ?? undefined,
        silent: input.silent,
        title: input.title
    });
}
// Resolve a pending approval from a notification button, mirroring the in-app
// Run/Reject bar. Keyed by session id — a background approval has no local guard.
export async function respondToApprovalAction(sessionId, actionId) {
    const choice = actionId === 'approve' ? 'once' : actionId === 'reject' ? 'deny' : null;
    if (!choice) {
        return;
    }
    const gateway = $gateway.get();
    if (!gateway) {
        return;
    }
    try {
        await gateway.request('approval.respond', { choice, session_id: sessionId ?? undefined });
        clearApprovalRequest(sessionId);
    }
    catch {
        // Leave the prompt parked so the user can still resolve it in-app.
    }
}
// Settings "send test" — bypasses gating. Returns whether the OS accepted it so
// the panel can flag a silent permission failure instead of looking dead.
export async function sendTestNativeNotification(title, body) {
    const bridge = window.hermesDesktop;
    if (!bridge?.notify) {
        return false;
    }
    try {
        return await bridge.notify({ body, kind: 'turnDone', title });
    }
    catch {
        return false;
    }
}
