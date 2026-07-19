import { desktopFsProfile, isDesktopFsRemoteMode } from './desktop-fs';
function desktopApi(path, body) {
    const desktop = window.hermesDesktop;
    if (!desktop) {
        throw new Error('Hermes Desktop bridge is unavailable');
    }
    return desktop.api(body ? { body, method: 'POST', path, profile: desktopFsProfile() } : { path, profile: desktopFsProfile() });
}
function gitGet(route, params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
            query.set(key, String(value));
        }
    }
    return desktopApi(`/api/git/${route}?${query.toString()}`);
}
function gitPost(route, body) {
    return desktopApi(`/api/git/${route}`, body);
}
const remoteGit = {
    worktreeList: async (repoPath) => (await gitGet('worktrees', { path: repoPath })).worktrees,
    worktreeAdd: (repoPath, options) => gitPost('worktree/add', { path: repoPath, ...options }),
    worktreeRemove: (repoPath, worktreePath, options) => gitPost('worktree/remove', { force: options?.force ?? false, path: repoPath, worktreePath }),
    branchSwitch: (repoPath, branch) => gitPost('branch/switch', { branch, path: repoPath }),
    branchList: async (repoPath) => (await gitGet('branches', { path: repoPath })).branches,
    repoStatus: repoPath => gitGet('status', { path: repoPath }),
    fileDiff: async (repoPath, filePath) => (await gitGet('file-diff', { file: filePath, path: repoPath })).diff,
    review: {
        list: (repoPath, scope, baseRef) => gitGet('review/list', { base: baseRef, path: repoPath, scope }),
        diff: async (repoPath, filePath, scope, baseRef, staged) => (await gitGet('review/diff', { base: baseRef, file: filePath, path: repoPath, scope, staged }))
            .diff,
        stage: (repoPath, filePath) => gitPost('review/stage', { file: filePath ?? null, path: repoPath }),
        unstage: (repoPath, filePath) => gitPost('review/unstage', { file: filePath ?? null, path: repoPath }),
        revert: (repoPath, filePath) => gitPost('review/revert', { file: filePath ?? null, path: repoPath }),
        revParse: async (repoPath, ref) => (await gitGet('review/rev-parse', { path: repoPath, ref })).sha,
        commit: (repoPath, message, push) => gitPost('review/commit', { message, path: repoPath, push }),
        commitContext: repoPath => gitGet('review/commit-context', { path: repoPath }),
        push: repoPath => gitPost('review/push', { path: repoPath }),
        shipInfo: repoPath => gitGet('review/ship-info', { path: repoPath }),
        createPr: repoPath => gitPost('review/create-pr', { path: repoPath })
    },
    // Repo discovery is a local-disk crawl; on a remote gateway the backend
    // already merges session-derived repos, so this is a no-op.
    scanRepos: async () => []
};
export function desktopGit() {
    return isDesktopFsRemoteMode() ? remoteGit : window.hermesDesktop?.git;
}
