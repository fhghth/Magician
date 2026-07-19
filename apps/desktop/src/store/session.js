import { atom, computed } from 'nanostores';
import { lastVisibleMessageIsUser } from '@/app/chat/thread-loading';
import { persistBoolean, persistString, storedBoolean, storedString } from '@/lib/storage';
const WORKSPACE_CWD_KEY = 'hermes.desktop.workspace-cwd';
// The composer's model/effort/fast is sticky UI state, NOT the profile default
// (that lives in Settings → Model). Persisting it in localStorage makes a pick
// follow across Cmd+N and app restarts instead of snapping back to the default.
// It's deliberately global (not per-profile): a profile switch force-reseeds to
// that profile's default, while within a profile new chats keep your last pick.
const COMPOSER_MODEL_KEY = 'hermes.desktop.composer.model';
const COMPOSER_PROVIDER_KEY = 'hermes.desktop.composer.provider';
const COMPOSER_EFFORT_KEY = 'hermes.desktop.composer.reasoning-effort';
const COMPOSER_FAST_KEY = 'hermes.desktop.composer.fast';
// The last chat the user had open, so a relaunch lands back on it instead of an
// empty new-chat. Stored (not runtime) id — the route is keyed by stored id.
const LAST_SESSION_KEY = 'hermes.desktop.lastSessionId';
export const getRememberedSessionId = () => storedString(LAST_SESSION_KEY);
export const setRememberedSessionId = (id) => persistString(LAST_SESSION_KEY, id);
let configuredDefaultProjectDir = '';
function workspaceCwdKey(connection = $connection.get()) {
    if (connection?.mode !== 'remote') {
        return WORKSPACE_CWD_KEY;
    }
    const base = encodeURIComponent(connection.baseUrl || 'remote');
    const profile = encodeURIComponent(connection.profile || 'default');
    return `${WORKSPACE_CWD_KEY}.remote.${base}.${profile}`;
}
export const getRememberedWorkspaceCwd = () => storedString(workspaceCwdKey())?.trim() || '';
export const getConfiguredDefaultProjectDir = () => configuredDefaultProjectDir;
export async function syncConfiguredDefaultProjectDir() {
    const settings = window.hermesDesktop?.settings?.getDefaultProjectDir;
    if (!settings) {
        configuredDefaultProjectDir = '';
        return '';
    }
    const { dir } = await settings();
    configuredDefaultProjectDir = dir?.trim() || '';
    return configuredDefaultProjectDir;
}
/** Align the renderer workspace with the main-process default (home dir when
 *  packaged, optional Settings override). Clears stale install-dir paths that
 *  PR #37586's localStorage stickiness can preserve across the #37536 fix. */
export async function ensureDefaultWorkspaceCwd() {
    const sanitize = window.hermesDesktop?.sanitizeWorkspaceCwd;
    if (!sanitize) {
        return;
    }
    await syncConfiguredDefaultProjectDir();
    const configured = getConfiguredDefaultProjectDir();
    const seedLiveCwd = (cwd) => {
        if (cwd && !$activeSessionId.get()) {
            setCurrentCwd(cwd);
        }
    };
    const remembered = getRememberedWorkspaceCwd();
    if ($connection.get()?.mode === 'remote') {
        seedLiveCwd(remembered);
        return;
    }
    if (configured) {
        const { cwd } = await sanitize(configured);
        seedLiveCwd(cwd);
        return;
    }
    if (remembered) {
        const { cwd } = await sanitize(remembered);
        seedLiveCwd(cwd);
    }
}
export function applyConfiguredDefaultProjectDir(dir) {
    configuredDefaultProjectDir = dir?.trim() || '';
    // Cache only — new chats read this via workspaceCwdForNewSession(). Do not
    // rewrite the live workspace (or localStorage) while a session is active.
    if (configuredDefaultProjectDir && !$activeSessionId.get()) {
        setCurrentCwd(configuredDefaultProjectDir);
    }
}
function updateAtom(store, next) {
    store.set(typeof next === 'function' ? next(store.get()) : next);
}
/** Durable id for pinning. Auto-compression rotates a conversation's session
 *  id (root -> continuation tip), so pins keyed on the live id evaporate. The
 *  lineage root is stable across every compression, so we pin on that. */
export const sessionPinId = (session) => session._lineage_root_id ?? session.id;
/** Merge a fresh server session page into the in-memory list, keeping any
 *  row the server omitted that we still want visible — both still-"working"
 *  sessions and pinned sessions.
 *
 *  Two reasons the server drops a row we must keep:
 *
 *  1. A brand-new session's first user message isn't flushed to the SessionDB
 *     until its turn is persisted, so `listSessions(min_messages=1)` skips
 *     sessions that are mid-first-response. Because every `message.complete`
 *     triggers a full refresh, a hard replace makes concurrent new chats vanish
 *     the instant any one of them finishes.
 *  2. The sidebar lists only the most-recent page (`SIDEBAR_SESSIONS_PAGE_SIZE`)
 *     ordered by activity. A pinned conversation that hasn't been touched in a
 *     while falls off that page, so a hard replace silently evicts it from the
 *     in-memory list — and because the Pinned section resolves pins against
 *     that list, the pin "disappears until you refresh".
 *
 *  `keepIds` carries both the working set and the pinned set. Pins are stored
 *  on the durable lineage-root id (see {@link sessionPinId}), while the loaded
 *  row surfaces under its live compression tip, so we match a survivor by
 *  either its live `id` or its `_lineage_root_id`. Optimistic deletes/archives
 *  drop the row from `previous` (and unpin it), so a removed session can't be
 *  resurrected here. */
export function mergeSessionPage(previous, incoming, keepIds) {
    const keep = keepIds instanceof Set ? keepIds : new Set(keepIds);
    // Carry a known title onto a row that arrives title-less, so a freshly
    // submitted session (e.g. a branch draft) holds its placeholder instead of
    // flashing its raw message preview in the gap between persist and the async
    // auto-titler. A real clear sets the local title null first, so this never
    // masks one.
    const prevById = new Map(previous.map(session => [session.id, session]));
    const merged = incoming.map(session => {
        if (session.title?.trim()) {
            return session;
        }
        const carried = prevById.get(session.id)?.title?.trim();
        return carried ? { ...session, title: carried } : session;
    });
    if (keep.size === 0) {
        return merged;
    }
    const incomingIds = new Set(merged.map(session => session.id));
    // Deduplicate by compression lineage: when auto-compression rotates the tip
    // id (old #4 → new #5), the incoming page carries the new tip but the
    // previous list still holds the old one.  Without lineage-level dedup both
    // rows survive as separate sidebar entries (fixes #43483).
    const incomingLineageKeys = new Set(merged.map(session => session._lineage_root_id ?? session.id));
    const survivors = previous.filter(session => !incomingIds.has(session.id) &&
        !incomingLineageKeys.has(session._lineage_root_id ?? session.id) &&
        (keep.has(session.id) || (session._lineage_root_id != null && keep.has(session._lineage_root_id))));
    return survivors.length ? [...survivors, ...merged] : merged;
}
export const $connection = atom(null);
export const $gatewayState = atom('idle');
export const $sessions = atom([]);
export const $sessionsTotal = atom(0);
// Cron-job sessions (source === 'cron') are fetched as their own list so the
// scheduler's always-newest sessions never crowd recents out of the page
// budget. Powers the collapsed "Cron jobs" sidebar section.
export const $cronSessions = atom([]);
// Max cron sessions fetched for the sidebar section (single bounded page). When
// the fetch returns exactly this many rows we know more exist, so the section
// badge renders "N+". Lives here so the controller (fetch) and sidebar (badge)
// share one source of truth without a circular import.
export const CRON_SECTION_LIMIT = 50;
// Messaging-platform sessions (telegram/discord/...) are fetched as their own
// slice — separate from local recents — so each platform renders a
// self-managed sidebar section and never interleaves with (or buries) local
// chats in the recents page. One combined fetch seeds every platform; a
// platform that exceeds this cap gets its own per-platform "load more".
export const $messagingSessions = atom([]);
export const MESSAGING_SECTION_LIMIT = 100;
// Exact per-platform conversation totals, keyed by source id. Empty until a
// per-platform "load more" fetch resolves it (the combined seed fetch only
// knows the aggregate), so sections fall back to their loaded count.
export const $messagingPlatformTotals = atom({});
// True when the combined seed fetch hit MESSAGING_SECTION_LIMIT, so at least
// one platform may have more rows on disk than were loaded.
export const $messagingTruncated = atom(false);
// Listable conversation count per profile (children excluded), keyed by profile
// name. Lets the sidebar scope its "Load more" footer to the active profile so a
// huge default profile doesn't keep "Load more" visible while browsing a small
// one. Empty for single-profile users (fall back to $sessionsTotal).
export const $sessionProfileTotals = atom({});
export const $sessionsLoading = atom(true);
export const $workingSessionIds = atom([]);
export const $activeSessionId = atom(null);
export const $selectedStoredSessionId = atom(null);
export const $messages = atom([]);
// Streaming-stable derivations of $messages. During a token stream the array
// is replaced ~30×/s; components that only care about coarse facts (is the
// thread empty? is the tail a user message?) subscribe to these instead of
// $messages so per-token flushes don't re-render them — nanostores' `computed`
// only notifies when the derived VALUE changes.
export const $messagesEmpty = computed($messages, messages => messages.length === 0);
export const $lastVisibleMessageIsUser = computed($messages, lastVisibleMessageIsUser);
export const $freshDraftReady = atom(false);
export const $busy = atom(false);
export const $awaitingResponse = atom(false);
// Stored-session id whose most recent resume FAILED terminally (the gateway RPC
// rejected AND the REST transcript fallback also failed), leaving the window
// with no runtime and an empty transcript. Drives use-route-resume's self-heal:
// while this matches the routed session the loader would otherwise latch
// forever (messagesEmpty && !activeSessionId), so the hook re-attempts the
// resume on the next render/focus/reconnect instead of stranding the window.
// Null whenever the active route has a healthy (or in-flight) resume.
export const $resumeFailedSessionId = atom(null);
// Stored-session id whose resume has EXHAUSTED its bounded auto-retries (the
// terminal-failure latch above kept failing through all MAX_RESUME_RETRIES
// attempts). Distinct from $resumeFailedSessionId, which is armed *during* the
// backoff window too: this fires only once auto-recovery has given up, so the
// chat view can swap the perpetual loader for an explicit error + manual Retry
// affordance. A fresh resumeSession() (manual Retry, reconnect, reselect)
// clears it and resets the retry counter. Null whenever the active route has a
// healthy, in-flight, or still-auto-retrying resume.
export const $resumeExhaustedSessionId = atom(null);
export const $currentModel = atom(storedString(COMPOSER_MODEL_KEY) ?? '');
export const $currentProvider = atom(storedString(COMPOSER_PROVIDER_KEY) ?? '');
export const $currentReasoningEffort = atom(storedString(COMPOSER_EFFORT_KEY) ?? '');
export const $currentServiceTier = atom('');
export const $currentFastMode = atom(storedBoolean(COMPOSER_FAST_KEY, false));
// Effective approval-bypass state mirrored from the gateway (session.info).
// Persistence lives in the backend config (approvals.mode), so this is a plain
// reflection of the truth the gateway reports rather than its own store.
export const $yoloActive = atom(false);
export const $currentCwd = atom(getRememberedWorkspaceCwd());
export const $currentBranch = atom('');
export const $currentUsage = atom({
    calls: 0,
    input: 0,
    output: 0,
    total: 0
});
export const $sessionStartedAt = atom(null);
export const $turnStartedAt = atom(null);
export const $introPersonality = atom('');
export const $currentPersonality = atom('');
export const $availablePersonalities = atom([]);
export const $introSeed = atom(0);
export const $contextSuggestions = atom([]);
export const $modelPickerOpen = atom(false);
export const $sessionPickerOpen = atom(false);
export const setConnection = (next) => updateAtom($connection, next);
export const setGatewayState = (next) => updateAtom($gatewayState, next);
export const setSessions = (next) => updateAtom($sessions, next);
export const setSessionsTotal = (next) => updateAtom($sessionsTotal, next);
export const setCronSessions = (next) => updateAtom($cronSessions, next);
export const setMessagingSessions = (next) => updateAtom($messagingSessions, next);
export const setMessagingPlatformTotals = (next) => updateAtom($messagingPlatformTotals, next);
export const setMessagingTruncated = (next) => updateAtom($messagingTruncated, next);
export const setSessionProfileTotals = (next) => updateAtom($sessionProfileTotals, next);
export const setSessionsLoading = (next) => updateAtom($sessionsLoading, next);
export const setWorkingSessionIds = (next) => updateAtom($workingSessionIds, next);
export const setActiveSessionId = (next) => updateAtom($activeSessionId, next);
export const setSelectedStoredSessionId = (next) => updateAtom($selectedStoredSessionId, next);
export const setMessages = (next) => updateAtom($messages, next);
export const setFreshDraftReady = (next) => updateAtom($freshDraftReady, next);
export const setResumeFailedSessionId = (next) => updateAtom($resumeFailedSessionId, next);
export const setResumeExhaustedSessionId = (next) => updateAtom($resumeExhaustedSessionId, next);
export const setBusy = (next) => updateAtom($busy, next);
export const setAwaitingResponse = (next) => updateAtom($awaitingResponse, next);
export const setCurrentModel = (next) => {
    updateAtom($currentModel, next);
    persistString(COMPOSER_MODEL_KEY, $currentModel.get() || null);
};
export const setCurrentProvider = (next) => {
    updateAtom($currentProvider, next);
    persistString(COMPOSER_PROVIDER_KEY, $currentProvider.get() || null);
};
export const setCurrentReasoningEffort = (next) => {
    updateAtom($currentReasoningEffort, next);
    persistString(COMPOSER_EFFORT_KEY, $currentReasoningEffort.get() || null);
};
export const setCurrentServiceTier = (next) => updateAtom($currentServiceTier, next);
export const setCurrentFastMode = (next) => {
    updateAtom($currentFastMode, next);
    persistBoolean(COMPOSER_FAST_KEY, $currentFastMode.get());
};
export const setYoloActive = (next) => updateAtom($yoloActive, next);
export const setCurrentCwd = (next) => {
    updateAtom($currentCwd, next);
    persistString(workspaceCwdKey(), $currentCwd.get().trim() || null);
};
export const workspaceCwdForNewSession = () => {
    if ($connection.get()?.mode === 'remote') {
        return getRememberedWorkspaceCwd();
    }
    // A bare new chat starts DETACHED — no inherited cwd, so the composer's coding
    // rail (which keys off $currentCwd) shows no branch and the first message runs
    // in the gateway's default rather than silently in the last repo you touched.
    // Only an explicit default-project-dir setting pre-attaches. Entering a
    // project/worktree attaches its cwd directly (startSessionInWorkspace), so the
    // "remember where I was when I'm in a project" case is unaffected.
    return getConfiguredDefaultProjectDir();
};
export const setCurrentBranch = (next) => updateAtom($currentBranch, next);
export const setCurrentUsage = (next) => updateAtom($currentUsage, next);
export const setSessionStartedAt = (next) => updateAtom($sessionStartedAt, next);
export const setTurnStartedAt = (next) => updateAtom($turnStartedAt, next);
export const setIntroPersonality = (next) => updateAtom($introPersonality, next);
export const setCurrentPersonality = (next) => updateAtom($currentPersonality, next);
export const setAvailablePersonalities = (next) => updateAtom($availablePersonalities, next);
export const setIntroSeed = (next) => updateAtom($introSeed, next);
export const setContextSuggestions = (next) => updateAtom($contextSuggestions, next);
export const setModelPickerOpen = (next) => updateAtom($modelPickerOpen, next);
export const setSessionPickerOpen = (next) => updateAtom($sessionPickerOpen, next);
// Watchdog tracking — when does a "working" session count as stuck?
// Long-running tool calls (LLM inference, long shell commands, web fetches)
// can take a few minutes legitimately. We allow 8 minutes of complete
// silence on the stream before clearing the working flag; in practice this
// catches gateway hangs and dropped streams without false-positive-clearing
// real long turns.
const SESSION_WATCHDOG_TIMEOUT_MS = 8 * 60 * 1000;
const sessionWatchdogTimers = new Map();
const sessionWatchdogListeners = new Set();
export function onSessionWatchdogClear(listener) {
    sessionWatchdogListeners.add(listener);
    return () => void sessionWatchdogListeners.delete(listener);
}
function armSessionWatchdog(sessionId) {
    const existing = sessionWatchdogTimers.get(sessionId);
    if (existing) {
        clearTimeout(existing);
    }
    const timer = setTimeout(() => {
        sessionWatchdogTimers.delete(sessionId);
        // Re-check the latest state at fire-time. If the user already navigated
        // away or the session genuinely finished, the timer is a no-op.
        if ($workingSessionIds.get().includes(sessionId)) {
            setWorkingSessionIds(current => current.filter(id => id !== sessionId));
        }
        for (const listener of sessionWatchdogListeners) {
            listener(sessionId);
        }
    }, SESSION_WATCHDOG_TIMEOUT_MS);
    sessionWatchdogTimers.set(sessionId, timer);
}
function clearSessionWatchdog(sessionId) {
    const existing = sessionWatchdogTimers.get(sessionId);
    if (existing) {
        clearTimeout(existing);
        sessionWatchdogTimers.delete(sessionId);
    }
}
// A session's "working" flag clears the instant its turn ends, but the
// cross-profile aggregator (listSessions with min_messages=1) only sees the
// just-persisted first turn a beat later. The active chat is shielded from that
// race by sessionsToKeep(), but a brand-new session that finished *while you
// were viewing a different chat* is, at the next refresh, neither working,
// pinned, nor active — so mergeSessionPage() evicts it. Nothing re-fetches
// afterward, so it stays gone until the app restarts. (Repro: start a new chat,
// then click another session before the first reply lands.)
//
// To bridge that window we keep a session in the merge keep-set for a short
// grace period after its turn settles, giving the aggregator time to catch up.
// Entries auto-expire, so this never accumulates and can't resurrect a deleted
// session (mergeSessionPage only revives rows still present in the in-memory
// list, which optimistic delete/archive already drops).
const SESSION_SETTLE_GRACE_MS = 30 * 1000;
const settledSessionExpiry = new Map();
function markSessionSettled(sessionId) {
    settledSessionExpiry.set(sessionId, Date.now() + SESSION_SETTLE_GRACE_MS);
}
function clearSessionSettled(sessionId) {
    settledSessionExpiry.delete(sessionId);
}
/** Stored ids of sessions whose turn ended within the grace window. Prunes
 *  expired entries as it reads, so it stays bounded without a timer. */
export function getRecentlySettledSessionIds(now = Date.now()) {
    const live = [];
    for (const [id, expiry] of settledSessionExpiry) {
        if (expiry > now) {
            live.push(id);
        }
        else {
            settledSessionExpiry.delete(id);
        }
    }
    return live;
}
/** Call when a streaming event for a session lands. Refreshes the watchdog
 *  so the session keeps its "working" status as long as data keeps coming. */
export function noteSessionActivity(sessionId) {
    if (!sessionId || !$workingSessionIds.get().includes(sessionId)) {
        return;
    }
    armSessionWatchdog(sessionId);
}
// Toggle an id's membership in a string-set atom, no-op when unchanged (keeps
// the same array reference so subscribers don't churn).
const toggleMembership = (set, id, on) => set(current => {
    const present = current.includes(id);
    if (on) {
        return present ? current : [...current, id];
    }
    return present ? current.filter(x => x !== id) : current;
});
// Stored session ids with a blocking prompt (clarify) waiting on the user.
// Separate from $workingSessionIds: a session can be "working" (turn running)
// AND need input. The sidebar row reads this for a persistent indicator that,
// unlike a toast, survives window blur / alt-tab.
export const $attentionSessionIds = atom([]);
export const setAttentionSessionIds = (next) => updateAtom($attentionSessionIds, next);
export function setSessionAttention(sessionId, needsInput) {
    if (sessionId) {
        toggleMembership(setAttentionSessionIds, sessionId, needsInput);
    }
}
export function setSessionWorking(sessionId, working) {
    if (!sessionId) {
        return;
    }
    const wasWorking = $workingSessionIds.get().includes(sessionId);
    toggleMembership(setWorkingSessionIds, sessionId, working);
    // Bookend the watchdog: arm on enter, disarm on leave. A later
    // noteSessionActivity() from a streaming event refreshes the timer.
    if (working) {
        clearSessionSettled(sessionId);
        armSessionWatchdog(sessionId);
    }
    else {
        clearSessionWatchdog(sessionId);
        // Only grant grace on a real working→idle transition (updateSessionState
        // re-asserts `false` on every state tick, which must not keep extending the
        // window). This keeps the just-finished session visible long enough for the
        // aggregator to return its now-persisted row.
        if (wasWorking) {
            markSessionSettled(sessionId);
        }
    }
}
