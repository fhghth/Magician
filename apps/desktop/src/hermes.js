import { JsonRpcGatewayClient } from '@hermes/shared';
// Desktop startup fires a burst of read-only data calls (config, profiles,
// model info/options, cron) the moment the backend passes readiness. On a
// profile-heavy or remote install these can each take tens of seconds — e.g.
// /api/profiles runs list_profiles(), which does a recursive skill-tree walk
// per profile — so the 15s default (DEFAULT_FETCH_TIMEOUT_MS in hardening.ts)
// times out a backend that is alive-but-busy, surfacing as a spurious
// "Timed out connecting to Hermes backend" that hangs the UI (#48504).
//
// Give the boot burst a generous per-call timeout instead of raising the
// global default: interactive/runtime calls and the liveness poll (/api/status)
// keep the short default so a genuinely-dead backend is still detected fast.
export const STARTUP_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 30_000;
const SESSION_LIST_REQUEST_TIMEOUT_MS = 60_000;
// prompt.submit is effectively fire-and-forget: turn completion is signaled by
// stream / message.complete events, NOT by the RPC return. A long turn (MoA
// presets running references + aggregator in series, deep reasoning, large tool
// chains) can legitimately take minutes to ACK, so bounding the ack by the
// generic 30s default surfaces a false "request timed out" toast while the turn
// is still running and will succeed (issue #55024). Match the backend's
// agent-turn ceiling (agent.gateway_timeout = 1800s) so the ack timeout only
// ever fires when the turn itself would have been abandoned server-side.
export const PROMPT_SUBMIT_REQUEST_TIMEOUT_MS = 1_800_000;
export class HermesGateway extends JsonRpcGatewayClient {
    constructor() {
        super({
            closedErrorMessage: 'Hermes gateway connection closed',
            connectErrorMessage: 'Could not connect to Hermes gateway',
            createRequestId: nextId => nextId,
            notConnectedErrorMessage: 'Hermes gateway is not connected',
            requestTimeoutMs: DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS
        });
    }
}
// Profile that profile-scoped REST settings (config/env/skills/tools/model/…)
// should target. Mirrors $activeGatewayProfile, pushed in from the store via
// setApiRequestProfile so this module needs no store import (avoids a cycle).
// Electron main consumes request.profile to pick which backend *process* serves
// the call; each pooled backend already has its own HERMES_HOME, so no backend
// change is needed. Null → primary, so single-profile users are unaffected.
let _apiProfile = null;
export function setApiRequestProfile(profile) {
    _apiProfile = profile || null;
}
function profileScoped() {
    return _apiProfile ? { profile: _apiProfile } : {};
}
export async function listSessions(limit = 40, minMessages = 0, archived = 'exclude', order = 'recent') {
    const result = await window.hermesDesktop.api({
        path: `/api/sessions?limit=${limit}&offset=0&min_messages=${Math.max(0, minMessages)}` +
            `&archived=${archived}&order=${order}`,
        timeoutMs: SESSION_LIST_REQUEST_TIMEOUT_MS
    });
    return {
        ...result,
        sessions: result.sessions.slice(0, limit),
        offset: 0
    };
}
export async function listAllProfileSessions(limit = 40, minMessages = 0, archived = 'exclude', order = 'recent', profile = 'all', filter = {}) {
    const sourceParam = filter.source ? `&source=${encodeURIComponent(filter.source)}` : '';
    const excludeParam = filter.excludeSources?.length
        ? `&exclude_sources=${encodeURIComponent(filter.excludeSources.join(','))}`
        : '';
    const result = await window.hermesDesktop.api({
        path: `/api/profiles/sessions?limit=${limit}&offset=0&min_messages=${Math.max(0, minMessages)}` +
            `&archived=${archived}&order=${order}&profile=${encodeURIComponent(profile)}${sourceParam}${excludeParam}`,
        timeoutMs: SESSION_LIST_REQUEST_TIMEOUT_MS
    });
    return {
        ...result,
        sessions: result.sessions.slice(0, limit),
        offset: 0
    };
}
// Mutations take the owning `profile` so Electron routes them to that profile's
// backend (remote pool or local primary) via request.profile — matching the
// read path. A remote session's row lives only on its remote host, so a mutation
// that hit the local primary would no-op or 404. Omit for the current/default.
export function setSessionArchived(id, archived, profile) {
    return window.hermesDesktop.api({
        ...(profile ? { profile } : {}),
        path: `/api/sessions/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body: { archived }
    });
}
export function searchSessions(query) {
    return window.hermesDesktop.api({
        path: `/api/sessions/search?q=${encodeURIComponent(query)}`
    });
}
// Resolves a single session row by id on one backend (the active profile, or
// the given `profile`). The backend resolves exact ids and unique prefixes and
// 404s when the id isn't on that profile — so a cheap by-id lookup replaces the
// cross-profile list scan when locating an unknown id's owner.
export function getSession(id, profile) {
    const suffix = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return window.hermesDesktop.api({
        ...(profile ? { profile } : {}),
        path: `/api/sessions/${encodeURIComponent(id)}${suffix}`
    });
}
// Reads another profile's transcript. For a remote profile Electron reroutes
// this GET to the remote backend (which serves its own state.db); for a local
// profile the primary opens that profile's state.db via ?profile=. Omit for
// the current/default profile.
export function getSessionMessages(id, profile) {
    const suffix = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    return window.hermesDesktop.api({
        ...(profile ? { profile } : {}),
        path: `/api/sessions/${encodeURIComponent(id)}/messages${suffix}`
    });
}
export function deleteSession(id, profile) {
    return window.hermesDesktop.api({
        ...(profile ? { profile } : {}),
        path: `/api/sessions/${encodeURIComponent(id)}`,
        method: 'DELETE'
    });
}
export function renameSession(id, title, profile) {
    return window.hermesDesktop.api({
        ...(profile ? { profile } : {}),
        path: `/api/sessions/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body: { title, ...(profile ? { profile } : {}) }
    });
}
export function getGlobalModelInfo() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/info',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
export function getStatus() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/status'
    });
}
export function getLogs(params) {
    const query = new URLSearchParams();
    if (params.file) {
        query.set('file', params.file);
    }
    if (typeof params.lines === 'number') {
        query.set('lines', String(params.lines));
    }
    if (params.level && params.level !== 'ALL') {
        query.set('level', params.level);
    }
    if (params.component && params.component !== 'all') {
        query.set('component', params.component);
    }
    if (params.search) {
        query.set('search', params.search);
    }
    const suffix = query.toString();
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: suffix ? `/api/logs?${suffix}` : '/api/logs'
    });
}
export function getHermesConfig() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/config',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
export function getHermesConfigRecord() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/config'
    });
}
export function getHermesConfigDefaults() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/config/defaults',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
export function getHermesConfigSchema() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/config/schema'
    });
}
export function saveHermesConfig(config) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/config',
        method: 'PUT',
        body: { config }
    });
}
export function getMemoryProviderConfig(provider) {
    return window.hermesDesktop.api({
        path: `/api/memory/providers/${encodeURIComponent(provider)}/config`
    });
}
export function saveMemoryProviderConfig(provider, values) {
    return window.hermesDesktop.api({
        path: `/api/memory/providers/${encodeURIComponent(provider)}/config`,
        method: 'PUT',
        body: { values }
    });
}
export function getEnvVars() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/env'
    });
}
export function setEnvVar(key, value) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/env',
        method: 'PUT',
        body: { key, value }
    });
}
export function validateProviderCredential(key, value, apiKey) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/providers/validate',
        method: 'POST',
        body: { key, value, api_key: apiKey ?? '' }
    });
}
export function deleteEnvVar(key) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/env',
        method: 'DELETE',
        body: { key }
    });
}
export function revealEnvVar(key) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/env/reveal',
        method: 'POST',
        body: { key }
    });
}
export function listOAuthProviders() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/providers/oauth'
    });
}
export function disconnectOAuthProvider(providerId) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/providers/oauth/${encodeURIComponent(providerId)}`,
        method: 'DELETE'
    });
}
export function startOAuthLogin(providerId) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
        method: 'POST',
        body: {}
    });
}
export function submitOAuthCode(providerId, sessionId, code) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
        method: 'POST',
        body: { session_id: sessionId, code }
    });
}
export function pollOAuthSession(providerId, sessionId) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`
    });
}
export function cancelOAuthSession(sessionId) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
        method: 'DELETE'
    });
}
// Memory-provider OAuth connect (provider-keyed; 404s for providers without an
// OAuth flow). Profile-scoped: the grant lands in the active profile's config.
export function startMemoryProviderOAuth(provider) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/memory/providers/${encodeURIComponent(provider)}/oauth/start`,
        method: 'POST'
    });
}
export function getMemoryProviderOAuthStatus(provider) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/memory/providers/${encodeURIComponent(provider)}/oauth/status`
    });
}
export function getSkills() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills'
    });
}
export function getStarmapGraph() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        // Backend REST contract — stays /api/learning even though the UI feature is
        // now "star map". Renaming this would break against an un-upgraded backend.
        path: '/api/learning/graph'
    });
}
export function getLearningNode(id) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/learning/node?id=${encodeURIComponent(id)}`
    });
}
export function deleteLearningNode(id) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/learning/node',
        method: 'DELETE',
        body: { id }
    });
}
export function editLearningNode(id, content) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/learning/node',
        method: 'PUT',
        body: { content, id }
    });
}
export function toggleSkill(name, enabled) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills/toggle',
        method: 'PUT',
        body: { name, enabled }
    });
}
/** Connect to the server, list its tools, disconnect. Slow (spawns/handshakes
 *  for real) — well past the 15s default fetch timeout. */
export function testMcpServer(name) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/mcp/servers/${encodeURIComponent(name)}/test`,
        method: 'POST',
        timeoutMs: 60_000
    });
}
/** Replace the whole `mcp_servers` map (the mcp.json editor's save). Unlike
 *  `saveHermesConfig`, this REPLACES rather than deep-merges, so deletes,
 *  re-enables (dropping `enabled: false`), and removed nested fields persist. */
export function saveMcpServers(servers) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/mcp/servers',
        method: 'PUT',
        body: { servers }
    });
}
/** Run the OAuth flow for an HTTP server — opens the system browser and blocks
 *  until the user finishes (or gives up), hence the very generous timeout. */
export function authMcpServer(name) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/mcp/servers/${encodeURIComponent(name)}/auth`,
        method: 'POST',
        timeoutMs: 300_000
    });
}
export function getToolsets() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/tools/toolsets'
    });
}
export function toggleToolset(name, enabled) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}`,
        method: 'PUT',
        body: { enabled }
    });
}
export function getToolsetConfig(name) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}/config`
    });
}
export function getToolsetModels(name, provider) {
    const suffix = provider ? `?provider=${encodeURIComponent(provider)}` : '';
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}/models${suffix}`
    });
}
export function selectToolsetModel(name, model, provider) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}/model`,
        method: 'PUT',
        body: { model, provider }
    });
}
export function selectToolsetProvider(name, provider) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}/provider`,
        method: 'PUT',
        body: { provider }
    });
}
export function runToolsetPostSetup(name, key) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/tools/toolsets/${encodeURIComponent(name)}/post-setup`,
        method: 'POST',
        body: { key }
    });
}
export function getComputerUseStatus() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/tools/computer-use/status'
    });
}
export function grantComputerUsePermissions() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/tools/computer-use/permissions/grant',
        method: 'POST'
    });
}
export function getMessagingPlatforms() {
    return window.hermesDesktop.api({
        path: '/api/messaging/platforms'
    });
}
export function updateMessagingPlatform(platformId, body) {
    return window.hermesDesktop.api({
        path: `/api/messaging/platforms/${encodeURIComponent(platformId)}`,
        method: 'PUT',
        body
    });
}
export function testMessagingPlatform(platformId) {
    return window.hermesDesktop.api({
        path: `/api/messaging/platforms/${encodeURIComponent(platformId)}/test`,
        method: 'POST'
    });
}
export function getCronJobs() {
    return window.hermesDesktop.api({
        path: '/api/cron/jobs',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
export function getCronJob(jobId) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}`
    });
}
export async function getCronJobRuns(jobId, limit = 20) {
    const { runs } = await window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}/runs?limit=${limit}`
    });
    return runs ?? [];
}
export function createCronJob(body) {
    return window.hermesDesktop.api({
        path: '/api/cron/jobs',
        method: 'POST',
        body
    });
}
export function updateCronJob(jobId, updates) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}`,
        method: 'PUT',
        body: { updates }
    });
}
export function pauseCronJob(jobId) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}/pause`,
        method: 'POST'
    });
}
export function resumeCronJob(jobId) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}/resume`,
        method: 'POST'
    });
}
export function triggerCronJob(jobId) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}/trigger`,
        method: 'POST'
    });
}
export function deleteCronJob(jobId) {
    return window.hermesDesktop.api({
        path: `/api/cron/jobs/${encodeURIComponent(jobId)}`,
        method: 'DELETE'
    });
}
export function getProfiles() {
    return window.hermesDesktop.api({
        path: '/api/profiles',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
export function createProfile(body) {
    return window.hermesDesktop.api({
        path: '/api/profiles',
        method: 'POST',
        body
    });
}
export function renameProfile(name, newName) {
    return window.hermesDesktop.api({
        path: `/api/profiles/${encodeURIComponent(name)}`,
        method: 'PATCH',
        body: { new_name: newName }
    });
}
export function deleteProfile(name) {
    return window.hermesDesktop.api({
        path: `/api/profiles/${encodeURIComponent(name)}`,
        method: 'DELETE'
    });
}
export function getProfileSoul(name) {
    return window.hermesDesktop.api({
        path: `/api/profiles/${encodeURIComponent(name)}/soul`
    });
}
export function updateProfileSoul(name, content) {
    return window.hermesDesktop.api({
        path: `/api/profiles/${encodeURIComponent(name)}/soul`,
        method: 'PUT',
        body: { content }
    });
}
export function getProfileSetupCommand(name) {
    return window.hermesDesktop.api({
        path: `/api/profiles/${encodeURIComponent(name)}/setup-command`
    });
}
export function getUsageAnalytics(days = 30) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/analytics/usage?days=${Math.max(1, Math.floor(days))}`
    });
}
export function getGlobalModelOptions(opts) {
    const params = new URLSearchParams();
    if (opts?.refresh) {
        params.set('refresh', '1');
    }
    if (opts?.includeUnconfigured) {
        params.set('include_unconfigured', '1');
    }
    if (opts?.explicitOnly !== false) {
        params.set('explicit_only', '1');
    }
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: params.size > 0 ? `/api/model/options?${params.toString()}` : '/api/model/options',
        timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    });
}
// Recommended default model for a freshly-authenticated provider. Mirrors the
// curation `hermes model` does — for Nous it honors the free/paid tier so a
// free user gets a free model instead of a paid default.
export function getRecommendedDefaultModel(provider) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/model/recommended-default?provider=${encodeURIComponent(provider)}`
    });
}
export function setGlobalModel(provider, model) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/set',
        method: 'POST',
        body: {
            scope: 'main',
            provider,
            model
        }
    });
}
export function getAuxiliaryModels() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/auxiliary'
    });
}
export function getMoaModels() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/moa'
    });
}
export function saveMoaModels(body) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/moa',
        method: 'PUT',
        body
    });
}
export function setModelAssignment(body) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/model/set',
        method: 'POST',
        body
    });
}
export function restartGateway() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/gateway/restart',
        method: 'POST'
    });
}
export function updateHermes() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/hermes/update',
        method: 'POST'
    });
}
/** Query the connected backend's own update state. In remote mode this is the
 *  authoritative source for the backend's behind-count + "what's changed",
 *  distinct from the Electron client clone's git state. */
export function checkHermesUpdate(force = false) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/hermes/update/check${force ? '?force=true' : ''}`
    });
}
export function getActionStatus(name, lines = 200) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/actions/${encodeURIComponent(name)}/status?lines=${Math.max(1, lines)}`
    });
}
export function transcribeAudio(dataUrl, mimeType) {
    return window.hermesDesktop.api({
        path: '/api/audio/transcribe',
        method: 'POST',
        body: {
            data_url: dataUrl,
            mime_type: mimeType
        }
    });
}
export function speakText(text) {
    return window.hermesDesktop.api({
        path: '/api/audio/speak',
        method: 'POST',
        body: { text }
    });
}
export function getElevenLabsVoices() {
    return window.hermesDesktop.api({
        path: '/api/audio/elevenlabs/voices'
    });
}
// ---------------------------------------------------------------------------
// Skills hub — search / preview / scan / install (parity with `hermes skills`
// and the dashboard's Browse-hub tab). Installs spawn background actions whose
// logs are tailed via getActionStatus().
// ---------------------------------------------------------------------------
const HUB_REQUEST_TIMEOUT_MS = 45_000;
export function getSkillHubSources() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills/hub/sources',
        timeoutMs: HUB_REQUEST_TIMEOUT_MS
    });
}
export function searchSkillsHub(query, source = 'all', limit = 20) {
    const params = new URLSearchParams({ q: query, source, limit: String(limit) });
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/skills/hub/search?${params.toString()}`,
        timeoutMs: HUB_REQUEST_TIMEOUT_MS
    });
}
export function previewSkillHub(identifier) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/skills/hub/preview?identifier=${encodeURIComponent(identifier)}`,
        timeoutMs: HUB_REQUEST_TIMEOUT_MS
    });
}
export function scanSkillHub(identifier) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/skills/hub/scan?identifier=${encodeURIComponent(identifier)}`,
        timeoutMs: HUB_REQUEST_TIMEOUT_MS
    });
}
export function installSkillFromHub(identifier) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills/hub/install',
        method: 'POST',
        body: { identifier }
    });
}
export function uninstallSkillFromHub(name) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills/hub/uninstall',
        method: 'POST',
        body: { name }
    });
}
export function updateSkillsFromHub() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/skills/hub/update',
        method: 'POST',
        body: {}
    });
}
// ---------------------------------------------------------------------------
// MCP servers — structured list / test / enable toggle / catalog (parity with
// `hermes mcp` and the dashboard MCP page). Raw JSON editing stays in
// config.yaml via saveHermesConfig.
// ---------------------------------------------------------------------------
export function listMcpServers() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/mcp/servers'
    });
}
export function setMcpServerEnabled(name, enabled) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: `/api/mcp/servers/${encodeURIComponent(name)}/enabled`,
        method: 'PUT',
        body: { enabled }
    });
}
export function getMcpCatalog() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/mcp/catalog'
    });
}
export function installMcpCatalogEntry(name, env = {}) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/mcp/catalog/install',
        method: 'POST',
        body: { name, env, enable: true },
        timeoutMs: 60_000
    });
}
// ---------------------------------------------------------------------------
// Memory data + curator (parity with `hermes memory` / `hermes curator`).
// ---------------------------------------------------------------------------
export function getMemoryStatus() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/memory'
    });
}
export function resetMemory(target) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/memory/reset',
        method: 'POST',
        body: { target }
    });
}
export function getCuratorStatus() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/curator'
    });
}
export function setCuratorPaused(paused) {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/curator/paused',
        method: 'PUT',
        body: { paused }
    });
}
export function runCurator() {
    return window.hermesDesktop.api({
        ...profileScoped(),
        path: '/api/curator/run',
        method: 'POST',
        body: {}
    });
}
// ---------------------------------------------------------------------------
// Maintenance operations (parity with `hermes doctor` / `hermes security
// audit` / `hermes backup` / `hermes debug share` and the dashboard System
// page). All except debug share are spawn-based background actions tailed via
// getActionStatus().
// ---------------------------------------------------------------------------
export function runDoctor() {
    return window.hermesDesktop.api({ path: '/api/ops/doctor', method: 'POST', body: {} });
}
export function runSecurityAudit() {
    return window.hermesDesktop.api({ path: '/api/ops/security-audit', method: 'POST', body: {} });
}
export function runBackup() {
    return window.hermesDesktop.api({
        path: '/api/ops/backup',
        method: 'POST',
        body: {}
    });
}
export function runDebugShare() {
    return window.hermesDesktop.api({
        path: '/api/ops/debug-share',
        method: 'POST',
        body: {},
        // Synchronous upload of report + logs to the paste service.
        timeoutMs: 120_000
    });
}
