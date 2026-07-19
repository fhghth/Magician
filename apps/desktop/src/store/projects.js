import { atom } from 'nanostores';
import { liveSessionProjectId } from '@/app/chat/sidebar/projects/workspace-groups';
import { translateNow } from '@/i18n';
import { desktopDefaultCwd, selectDesktopPaths, writeDesktopFileText } from '@/lib/desktop-fs';
import { desktopGit } from '@/lib/desktop-git';
import { isMissingRpcMethod } from '@/lib/gateway-rpc';
import { persistentAtom } from '@/lib/persisted';
import { activeGateway, ensureActiveGatewayOpen } from '@/store/gateway';
import { setSidebarAgentsGrouped } from '@/store/layout';
import { notify } from '@/store/notifications';
import { requestFreshSession } from '@/store/profile';
import { $selectedStoredSessionId, $sessions, workspaceCwdForNewSession } from '@/store/session';
// First-class, per-profile Projects (named, multi-folder workspaces). State is
// served by the live gateway's `projects.*` JSON-RPC methods, which wrap the
// per-profile projects.db store. The sidebar groups sessions by project folder
// membership; these atoms are the renderer's cached view.
export const $projects = atom([]);
export const $activeProjectId = atom(null);
// The authoritative project -> repo -> lane tree (overview), served by
// `projects.tree`. Lanes carry counts + structure; per-project session rows are
// fetched lazily on drill-in via `fetchProjectSessions`. This is the single
// source of project membership — the desktop no longer derives it.
export const $projectTree = atom([]);
export const $projectTreeLoading = atom(false);
// False when the connected backend predates the projects.* JSON-RPC surface
// (same semver label, older install). Null until the first probe.
export const $projectsRpcAvailable = atom(null);
function markProjectsRpcSuccess() {
    $projectsRpcAvailable.set(true);
}
function markProjectsRpcFailure(err) {
    if (isMissingRpcMethod(err)) {
        $projectsRpcAvailable.set(false);
    }
}
function projectsStaleBackendError() {
    return new Error(translateNow('sidebar.projects.staleBackend'));
}
// Client-side cache eviction (Apollo-style optimistic layer): ids the user just
// deleted/archived. The backend tree is a snapshot that still lists them until
// its next refresh, so the render-time overlay strips these so the tree matches
// the live `$sessions` cache exactly — same as the flat Recents list. Pruned on
// refresh once the server snapshot has caught up.
export const $removedSessionIds = atom(new Set());
export function tombstoneSessions(ids) {
    const next = new Set($removedSessionIds.get());
    const before = next.size;
    for (const id of ids) {
        const trimmed = id?.trim();
        if (trimmed) {
            next.add(trimmed);
        }
    }
    if (next.size !== before) {
        $removedSessionIds.set(next);
    }
}
export function untombstoneSessions(ids) {
    const current = $removedSessionIds.get();
    if (!current.size) {
        return;
    }
    const next = new Set(current);
    for (const id of ids) {
        const trimmed = id?.trim();
        if (trimmed) {
            next.delete(trimmed);
        }
    }
    if (next.size !== current.size) {
        $removedSessionIds.set(next);
    }
}
// True while the disk scan is in flight (drives the "finding repos" hint).
export const $reposScanning = atom(false);
// ── Project scope (the "you're inside a project" view, mirroring profile scope)─
// The sidebar's grouped view is a project switcher: ALL_PROJECTS shows the
// project overview (a list you drill into), and a concrete id means you've
// "entered" that project so only its worktrees/branches/sessions show. This is
// pure view state (localStorage), distinct from the durable active-project
// pointer in projects.db — though entering a project also makes it active so new
// chats land there, exactly as selecting a profile does.
export const ALL_PROJECTS = '__all_projects__';
const PROJECT_SCOPE_KEY = 'hermes.desktop.projectScope';
export const $projectScope = persistentAtom(PROJECT_SCOPE_KEY, ALL_PROJECTS, {
    decode: raw => raw || ALL_PROJECTS,
    encode: value => value || ALL_PROJECTS
});
// Enter a project: scope the sidebar to it and make it the active project
// (best-effort — the durable pointer is nice-to-have, the view scope is the
// point). Never opens a session.
export function enterProject(id) {
    $projectScope.set(id);
    // Only explicit, persisted projects (ids are `p_<hex>`) become active. Auto
    // projects (ids are filesystem paths) and the "No project" bucket have no
    // durable row to pin, so they're view-scope only.
    if (id.startsWith('p_')) {
        void setActiveProject(id).catch(() => undefined);
    }
}
export function exitProjectScope() {
    $projectScope.set(ALL_PROJECTS);
}
// The cwd a NEW chat should start in. The "active project" is just an atom
// ($projectScope) — so when you're inside a project, a new session (cmd-n, the
// trunk "+") starts at that project's root (its primary repo = the default-branch
// checkout) instead of inheriting whatever unrelated worktree the live cwd
// drifted into. Outside a project it falls back to the plain default (detached),
// so a bare new chat shows no branch.
export function resolveNewSessionCwd() {
    const scope = $projectScope.get();
    if (scope !== ALL_PROJECTS) {
        const project = $projectTree.get().find(node => node.id === scope);
        const cwd = (project?.path || project?.repos.find(repo => repo.path)?.path || '').trim();
        if (cwd) {
            return cwd;
        }
    }
    return workspaceCwdForNewSession();
}
const underPath = (parent, child) => child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
// The project (explicit or auto) that owns `cwd`, by longest path match across
// the live tree. Null when no project covers it (it'll surface as a fresh
// auto-project on the next tree refresh).
export function projectIdForCwd(cwd) {
    let best = null;
    let bestLen = -1;
    for (const project of $projectTree.get()) {
        // Match project + repo roots AND each worktree-lane path: a linked worktree
        // (e.g. a sibling `repo-retry`) lives OUTSIDE the repo root, so root-prefix
        // matching alone would miss it — but it's still part of the project.
        const paths = [project.path, ...project.repos.flatMap(repo => [repo.path, ...repo.groups.map(group => group.path)])];
        for (const path of paths) {
            const p = (path || '').trim();
            if (p && underPath(p, cwd) && p.length > bestLen) {
                bestLen = p.length;
                best = project.id;
            }
        }
    }
    return best;
}
// The active session's agent relocated itself (created/entered another repo or
// worktree via the terminal — backend re-anchors its cwd and emits session.info).
// Re-pull projects + tree so a freshly created/auto project and the relocated
// session row show live, then follow the view into the session's new project
// (from the overview or a now-stale project alike). Caller gates this on a real
// same-session cwd move, so a plain session switch never reaches here.
export async function followActiveSessionCwd(cwd) {
    const target = cwd.trim();
    if (!target) {
        return;
    }
    await Promise.all([refreshProjects(), refreshProjectTree()]);
    // Resolve only after the refresh, so a just-created/auto project is in the tree.
    const projectId = projectIdForCwd(target);
    if (projectId) {
        // The Projects tree only renders in grouped mode, so flip the sidebar into
        // it — otherwise following from the flat Sessions list would change scope
        // invisibly. Then drill into the thread's project.
        setSidebarAgentsGrouped(true);
        if (projectId !== $projectScope.get()) {
            enterProject(projectId);
        }
    }
}
// Issue a request on whichever gateway is currently active, reconnecting once
// if the socket dropped. Projects are per-profile, so they intentionally follow
// the active gateway just like the session list does.
async function gatewayRequest(method, params = {}) {
    let gateway = activeGateway();
    if (!gateway || gateway.connectionState !== 'open') {
        gateway = await ensureActiveGatewayOpen();
    }
    if (!gateway) {
        throw new Error('Hermes gateway is not connected');
    }
    return gateway.request(method, params);
}
function applyPayload(payload) {
    $projects.set(payload.projects ?? []);
    $activeProjectId.set(payload.active_id ?? null);
}
// Pull the full project list + active pointer. Best-effort: a failure (gateway
// not up yet) leaves the cached atoms intact so the sidebar doesn't flicker.
export async function refreshProjects() {
    try {
        applyPayload(await gatewayRequest('projects.list'));
        markProjectsRpcSuccess();
    }
    catch (err) {
        markProjectsRpcFailure(err);
        // Backend may not be ready; keep the last known list.
    }
}
// Pull the authoritative project tree (overview structure + counts + preview
// sessions + the scoped-session-id set). Best-effort: a failure leaves the
// cached tree intact so the sidebar doesn't flicker.
export async function refreshProjectTree() {
    $projectTreeLoading.set(true);
    try {
        const res = await gatewayRequest('projects.tree', { preview_limit: 3 });
        // The flat Sessions list shows everything; scoped ids are only used here to
        // reconcile the optimistic eviction layer against what the server still lists.
        const scoped = new Set(res.scoped_session_ids ?? []);
        $projectTree.set(res.projects ?? []);
        $activeProjectId.set(res.active_id ?? null);
        // Reconcile the optimistic eviction layer against the fresh snapshot: keep
        // evicting ids the server still lists (delete in flight) and drop the rest
        // (server caught up), so the set can't grow unbounded across a long session.
        const tombstones = $removedSessionIds.get();
        if (tombstones.size) {
            const pending = new Set([...tombstones].filter(id => scoped.has(id)));
            if (pending.size !== tombstones.size) {
                $removedSessionIds.set(pending);
            }
        }
        markProjectsRpcSuccess();
    }
    catch (err) {
        markProjectsRpcFailure(err);
        // Backend may not be ready; keep the last known tree.
    }
    finally {
        $projectTreeLoading.set(false);
    }
}
// Fully hydrated lanes (repo -> lane -> session rows) for one project, fetched
// when the user enters it. Same backend grouping as `projects.tree`, so ids and
// membership match exactly.
export async function fetchProjectSessions(projectId) {
    try {
        const res = await gatewayRequest('projects.project_sessions', {
            project_id: projectId
        });
        return res.project ?? null;
    }
    catch {
        return null;
    }
}
// One filesystem scan per app run: the heavy disk walk happens once, the result
// is cached in the backend, and later opens read the cache. Desktop-only (needs
// the native crawler); elsewhere discovery falls back to session-derived repos.
let didScanRepos = false;
export async function scanAndRecordRepos(force = false) {
    const scan = desktopGit()?.scanRepos;
    if (!scan || (didScanRepos && !force)) {
        return;
    }
    didScanRepos = true;
    $reposScanning.set(true);
    try {
        const repos = await scan([]);
        await gatewayRequest('projects.record_repos', { repos });
        // The disk scan may surface new zero-session repos; refold them into the tree.
        await refreshProjectTree();
    }
    catch {
        didScanRepos = false; // let a later open retry a failed scan
    }
    finally {
        $reposScanning.set(false);
    }
}
// Generate a project idea via the stateless llm.oneshot RPC (inherits the live
// session's model when one exists). Returns "" on failure so the caller can just
// leave the field untouched. The "🎲" affordance in the new-project dialog.
export async function generateProjectIdea(name) {
    try {
        const res = await gatewayRequest('llm.oneshot', {
            instructions: 'You generate a single, concrete project idea as a short IDEA.md body: a one-line summary, ' +
                'then 3-5 bullet goals. No preamble, no code fences, under 120 words.',
            input: name.trim() ? `Project name: ${name.trim()}` : 'Surprise me with a fun project.',
            temperature: 1.0
        });
        return (res.text || '').trim();
    }
    catch {
        return '';
    }
}
// Write IDEA.md to a project's primary folder (best-effort). Routes through the
// remote-aware fs write, so it lands on the backend for a remote gateway and on
// disk locally — the project is created regardless of whether the file lands.
async function writeProjectIdea(folder, idea) {
    const dir = (folder || '').trim();
    const body = idea.trim();
    if (!dir || !body) {
        return;
    }
    try {
        await writeDesktopFileText(`${dir.replace(/[/\\]+$/, '')}/IDEA.md`, body.endsWith('\n') ? body : `${body}\n`);
    }
    catch {
        // Best-effort: the project is created regardless of whether IDEA.md lands.
    }
}
const snapshotProjects = () => ({
    projects: $projects.get(),
    tree: $projectTree.get(),
    active: $activeProjectId.get()
});
const restoreProjects = ({ projects, tree, active }) => {
    $projects.set(projects);
    $projectTree.set(tree);
    $activeProjectId.set(active);
};
// Await an already-applied optimistic write; restore the snapshot if it throws.
async function persistOrRollback(snap, write) {
    try {
        await write();
    }
    catch (err) {
        restoreProjects(snap);
        throw err;
    }
}
const reconcileProjects = () => {
    void refreshProjects();
    void refreshProjectTree();
};
// Map a ProjectInfo (list shape) onto a minimal overview tree node so a created
// project paints instantly. The backend seeds each folder as an (empty) repo, so
// the next tree refresh fills in repos/counts; this is just the optimistic stub.
function projectInfoToTreeNode(project) {
    return {
        id: project.id,
        label: project.name || project.id,
        path: project.primary_path ?? project.folders?.[0]?.path ?? null,
        color: project.color ?? null,
        icon: project.icon ?? null,
        isAuto: false,
        repos: [],
        sessionCount: 0,
        previewSessions: []
    };
}
export async function createProject(input) {
    if ($projectsRpcAvailable.get() === false) {
        throw projectsStaleBackendError();
    }
    let res;
    try {
        res = await gatewayRequest('projects.create', {
            name: input.name,
            folders: input.folders ?? [],
            primary_path: input.primaryPath,
            slug: input.slug,
            description: input.description,
            icon: input.icon,
            color: input.color,
            board_slug: input.boardSlug,
            use: input.use ?? false
        });
    }
    catch (err) {
        if (isMissingRpcMethod(err)) {
            $projectsRpcAvailable.set(false);
            throw projectsStaleBackendError();
        }
        throw err;
    }
    markProjectsRpcSuccess();
    // Not optimistic (the create awaits the RPC first, so there's nothing to roll
    // back): apply the server's row into the cached list + tree at once, so it
    // (and an entered scope) shows without waiting on the background refreshes
    // that reconcile counts/repos.
    const created = res.project;
    if (created) {
        if (input.idea) {
            void writeProjectIdea(created.primary_path ?? created.folders?.[0]?.path ?? input.primaryPath, input.idea);
        }
        if (!$projects.get().some(proj => proj.id === created.id)) {
            $projects.set([...$projects.get(), created]);
        }
        if (!$projectTree.get().some(node => node.id === created.id)) {
            $projectTree.set([projectInfoToTreeNode(created), ...$projectTree.get()]);
        }
        if (input.use) {
            $activeProjectId.set(created.id);
        }
        setSidebarAgentsGrouped(true);
    }
    reconcileProjects();
    return created;
}
export async function renameProject(id, name) {
    await updateProject(id, { name });
}
// Patch top-level project fields (name / appearance). Optimistic: the cached
// tree + list update instantly so a color/icon/name change has no round-trip
// lag; only a failed write reconciles from the server.
export async function updateProject(id, patch) {
    const snap = snapshotProjects();
    $projectTree.set(snap.tree.map(node => node.id === id
        ? {
            ...node,
            ...(patch.name !== undefined && { label: patch.name }),
            ...(patch.color !== undefined && { color: patch.color }),
            ...(patch.icon !== undefined && { icon: patch.icon })
        }
        : node));
    $projects.set(snap.projects.map(proj => (proj.id === id ? { ...proj, ...patch } : proj)));
    // Backend treats null/undefined as "leave unchanged"; "" clears (stores NULL).
    // Map explicit null → "" so "no color"/"no icon" actually clear.
    await persistOrRollback(snap, () => gatewayRequest('projects.update', {
        id,
        ...patch,
        ...(patch.color === null && { color: '' }),
        ...(patch.icon === null && { icon: '' })
    }));
}
export async function addProjectFolder(id, path, opts = {}) {
    const snap = snapshotProjects();
    const trimmed = path.trim();
    // Optimistic: append the folder to the cached project + reflect a primary-path
    // change on its tree node, so the dialog closes onto an updated row. The folder
    // -> repo seeding (and session regrouping) is backend-computed, so the
    // background refresh fills repos in; a failure rolls the cache back.
    if (trimmed) {
        const folder = { path: trimmed, label: opts.label ?? null, is_primary: opts.isPrimary ?? false, added_at: 0 };
        $projects.set(snap.projects.map(proj => {
            if (proj.id !== id || proj.folders?.some(f => f.path === trimmed)) {
                return proj;
            }
            const folders = opts.isPrimary
                ? [folder, ...proj.folders.map(f => ({ ...f, is_primary: false }))]
                : [...proj.folders, folder];
            return { ...proj, folders, ...(opts.isPrimary && { primary_path: trimmed }) };
        }));
        if (opts.isPrimary) {
            $projectTree.set(snap.tree.map(node => (node.id === id ? { ...node, path: trimmed } : node)));
        }
    }
    await persistOrRollback(snap, () => gatewayRequest('projects.add_folder', { id, path, label: opts.label, is_primary: opts.isPrimary ?? false }));
    reconcileProjects();
}
// True when the session currently open in the main pane belongs to `projectId`.
// Used so deleting a project you have a session open from kicks you back to the
// intro draft instead of stranding you in a now-orphaned view.
function openSessionBelongsToProject(projectId, projects) {
    const openId = $selectedStoredSessionId.get();
    if (!openId) {
        return false;
    }
    const open = $sessions.get().find(s => s.id === openId || s._lineage_root_id === openId);
    return Boolean(open && liveSessionProjectId(open, projects) === projectId);
}
// Optimistic: drop the project from the cached tree + list the instant it's
// clicked (the entered-scope effect exits if you deleted the project you were
// inside), reconciling from the server payload. A failed delete restores both.
export async function deleteProject(id) {
    const snap = snapshotProjects();
    // Capture membership BEFORE removal — the project's folders (which determine
    // ownership) are gone once it's dropped from the cache.
    const kickToIntro = openSessionBelongsToProject(id, snap.projects);
    $projects.set(snap.projects.filter(project => project.id !== id));
    $projectTree.set(snap.tree.filter(node => node.id !== id));
    if (snap.active === id) {
        $activeProjectId.set(null);
    }
    // The open session's project is gone — reset to the intro draft (the session
    // itself survives; it just falls back to Recents).
    if (kickToIntro) {
        requestFreshSession();
    }
    await persistOrRollback(snap, async () => {
        applyPayload(await gatewayRequest('projects.delete', { id }));
    });
    void refreshProjectTree();
}
export async function setActiveProject(id) {
    const res = await gatewayRequest('projects.set_active', { id });
    $activeProjectId.set(res.active_id ?? null);
}
export const $projectDialog = atom(null);
export function openProjectCreate() {
    if ($projectsRpcAvailable.get() === false) {
        notify({
            kind: 'warning',
            message: translateNow('sidebar.projects.staleBackend')
        });
        return;
    }
    $projectDialog.set({ mode: 'create' });
}
export function openProjectRename(project) {
    $projectDialog.set({ mode: 'rename', name: project.name, projectId: project.id });
}
export function openProjectAddFolder(project) {
    $projectDialog.set({ mode: 'add-folder', name: project.name, projectId: project.id });
}
export function closeProjectDialog() {
    $projectDialog.set(null);
}
// ── Git-driven worktrees ("Start work") ─────────────────────────────────────
// Bumped after a `git worktree add`/`remove` so the sidebar's worktree-list
// probe (useRepoWorktreeMap) refetches and the new/removed lane shows at once,
// instead of waiting for the next scope change.
export const $worktreeRefreshToken = atom(0);
const bumpWorktrees = () => $worktreeRefreshToken.set($worktreeRefreshToken.get() + 1);
// Re-run the visual `git worktree list` probe without the heavy projects.tree
// scan. Desktop-initiated add/remove already bumps the token inline; this is for
// OUT-OF-BAND changes the renderer can't see: the agent runs `git worktree
// add/remove` in the terminal during a turn, or an external terminal mutates the
// repo while the window was away. The probe is per-repo and bounded, so the
// caller (a settled turn / window refocus) can re-sync the worktree lanes
// cheaply, the same way a git GUI refreshes its tree on focus.
export function refreshWorktrees() {
    bumpWorktrees();
}
// Spin up a fresh worktree the lightest way (`git worktree add -b`) under the
// repo, returning where Hermes should start working. Git is the source of
// truth; the caller starts a session in the returned path.
export async function startWorkInRepo(repoPath, options) {
    const git = desktopGit();
    if (!git || !repoPath) {
        return null;
    }
    const result = await git.worktreeAdd(repoPath, options);
    bumpWorktrees();
    return { branch: result.branch, path: result.path };
}
// Local branches for the composer's "convert a branch into a worktree" picker.
// Empty on a remote backend / non-repo (the Electron probe can't run).
export async function listRepoBranches(repoPath) {
    const git = desktopGit();
    if (!git?.branchList || !repoPath) {
        return [];
    }
    return git.branchList(repoPath);
}
export async function switchBranchInRepo(repoPath, branch) {
    const git = desktopGit();
    if (!git || !repoPath || !branch.trim()) {
        return;
    }
    await git.branchSwitch(repoPath, branch);
    bumpWorktrees();
}
export const $startWorkSessionRequest = atom(null);
// Keyboard-driven "spin up a new worktree" intent. The composer's coding rail
// owns the name dialog (it has the active repo + branch context), so a global
// hotkey just bumps this token; the rail opens its branch-off dialog in
// response. A monotonic token re-fires even on repeat presses. No-ops off a
// repo (the rail isn't mounted), which is the right "nothing to branch" outcome.
export const $newWorktreeRequest = atom(0);
export function requestNewWorktree() {
    $newWorktreeRequest.set($newWorktreeRequest.get() + 1);
}
let startWorkToken = 0;
export function requestStartWorkSession(path, draft) {
    const target = path.trim();
    if (!target) {
        return;
    }
    startWorkToken += 1;
    $startWorkSessionRequest.set({ draft: draft?.trim() || undefined, path: target, token: startWorkToken });
}
export async function removeWorktreePath(repoPath, worktreePath, options) {
    const git = desktopGit();
    if (!git) {
        return;
    }
    await git.worktreeRemove(repoPath, worktreePath, options);
    bumpWorktrees();
}
// Reveal a project/worktree path in the OS file manager (git-GUI standard).
export async function revealPath(path) {
    if (path) {
        await window.hermesDesktop?.revealPath?.(path);
    }
}
// Copy a path to the clipboard (git-GUI standard).
export async function copyPath(path) {
    if (path) {
        await window.hermesDesktop?.writeClipboard?.(path);
    }
}
// Pick a project folder via the remote-aware picker: a remote gateway browses
// the backend filesystem (seeded at its default cwd) where sessions run; local
// mode opens the native dialog. Returns the absolute path, or null if cancelled.
export async function pickProjectFolder() {
    const [dir] = await selectDesktopPaths({
        defaultPath: (await desktopDefaultCwd())?.cwd,
        directories: true,
        multiple: false
    });
    return dir || null;
}
