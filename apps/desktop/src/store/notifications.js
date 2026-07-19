import { atom } from 'nanostores';
import { translateNow } from '@/i18n';
let notificationCounter = 0;
const timers = new Map();
export const $notifications = atom([]);
function defaultDuration(kind) {
    if (kind === 'error' || kind === 'warning') {
        return 0;
    }
    return 5_000;
}
// Only interruptions worth a top-center toast: errors, warnings, and anything
// with an action button the user needs to notice and click (restart gateway,
// update available, sign-in prompts). Everything else — the bulk of routine
// "saved"/"enabled"/"archived" confirmations across settings, MCP, cron,
// profiles, messaging — is ambient feedback and defaults to a quiet
// bottom-right toast instead. Callers can still force `placement: 'default'`
// for a specific case.
function defaultPlacement(kind, action) {
    if (kind === 'error' || kind === 'warning' || action) {
        return 'default';
    }
    return 'bottom-right';
}
function cleanErrorText(value) {
    return value.replace(/^Error:\s*/, '').trim();
}
const ERROR_SUMMARIES = [
    {
        test: msg => /incorrect api key provided/i.test(msg) || /['"]code['"]\s*:\s*['"]invalid_api_key['"]/i.test(msg),
        summarize: msg => {
            const status = msg.match(/(?:error code|status(?:Code)?)[^\d]*(\d{3})/i)?.[1];
            return status
                ? translateNow('notifications.errors.openaiRejectedApiKeyWithStatus', status)
                : translateNow('notifications.errors.openaiRejectedApiKey');
        }
    },
    {
        test: msg => /neither voice_tools_openai_key nor openai_api_key is set/i.test(msg),
        summarize: () => translateNow('notifications.errors.openaiTtsNeedsKey')
    },
    {
        test: msg => /ELEVENLABS_API_KEY not set/i.test(msg) || /ElevenLabs STT API error \(HTTP 401\)/i.test(msg),
        summarize: msg => /ELEVENLABS_API_KEY not set/i.test(msg)
            ? translateNow('notifications.errors.elevenLabsNeedsKey')
            : translateNow('notifications.errors.elevenLabsRejectedKey')
    },
    {
        test: msg => /method not allowed/i.test(msg),
        summarize: () => translateNow('notifications.errors.methodNotAllowed')
    },
    {
        test: msg => /microphone permission/i.test(msg),
        summarize: () => translateNow('notifications.errors.microphonePermission')
    }
];
function summarizeErrorMessage(message, fallback) {
    const rule = ERROR_SUMMARIES.find(r => r.test(message));
    if (rule) {
        return rule.summarize(message);
    }
    return message.length > 180 ? fallback : message || fallback;
}
function readableError(error, fallback) {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
    const unwrapped = raw.match(/Error invoking remote method '[^']+': Error: (.+)$/)?.[1] ?? raw;
    const cleaned = cleanErrorText(unwrapped);
    const detail = cleaned.match(/"detail"\s*:\s*"([^"]+)"/)?.[1] ?? cleaned;
    const summary = summarizeErrorMessage(detail, fallback);
    return { message: summary, detail: detail === summary ? undefined : detail };
}
export function notify(input) {
    const kind = input.kind ?? 'info';
    const id = input.id ?? `${Date.now()}-${notificationCounter++}`;
    const notification = {
        id,
        kind,
        icon: input.icon,
        title: input.title,
        message: input.message,
        detail: input.detail,
        action: input.action,
        onDismiss: input.onDismiss,
        createdAt: Date.now(),
        placement: input.placement ?? defaultPlacement(kind, input.action)
    };
    window.clearTimeout(timers.get(id));
    timers.delete(id);
    $notifications.set([notification, ...$notifications.get().filter(item => item.id !== id)].slice(0, 4));
    const duration = input.durationMs ?? defaultDuration(kind);
    if (duration > 0) {
        timers.set(id, window.setTimeout(() => dismissNotification(id), duration));
    }
    return id;
}
export function notifyError(error, fallback) {
    const readable = readableError(error, fallback);
    return notify({
        kind: 'error',
        title: fallback,
        message: readable.message,
        detail: readable.detail
    });
}
export function dismissNotification(id) {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
    const dismissed = $notifications.get().find(item => item.id === id);
    $notifications.set($notifications.get().filter(item => item.id !== id));
    dismissed?.onDismiss?.();
}
export function clearNotifications() {
    for (const timer of timers.values()) {
        window.clearTimeout(timer);
    }
    timers.clear();
    const all = $notifications.get();
    $notifications.set([]);
    for (const item of all) {
        item.onDismiss?.();
    }
}
