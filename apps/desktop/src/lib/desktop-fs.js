import { $connection } from '@/store/session';
let remotePicker = null;
export function setDesktopFsRemotePicker(next) {
    remotePicker = next;
}
function connectionCacheKey(connection) {
    if (!connection) {
        return 'local:';
    }
    return `${connection.mode || 'local'}:${connection.profile || ''}:${connection.baseUrl || ''}`;
}
export function desktopFsCacheKey() {
    return connectionCacheKey($connection.get());
}
export function isDesktopFsRemoteMode() {
    return $connection.get()?.mode === 'remote';
}
// Active profile for FS/git REST calls. Without it the Electron api bridge
// hits the primary (local) backend even when the user switched to a remote profile.
export function desktopFsProfile() {
    return $connection.get()?.profile || undefined;
}
function fsPath(endpoint, filePath) {
    return `/api/fs/${endpoint}?path=${encodeURIComponent(filePath)}`;
}
function bridge() {
    const desktop = window.hermesDesktop;
    if (!desktop) {
        throw new Error('Hermes Desktop bridge is unavailable');
    }
    return desktop;
}
function remoteFsApi(path, body) {
    return bridge().api(body ? { body, method: 'POST', path, profile: desktopFsProfile() } : { path, profile: desktopFsProfile() });
}
export async function readDesktopDir(path) {
    if (!isDesktopFsRemoteMode()) {
        return bridge().readDir(path);
    }
    return remoteFsApi(fsPath('list', path));
}
export async function readDesktopFileText(path) {
    if (!isDesktopFsRemoteMode()) {
        return bridge().readFileText(path);
    }
    return remoteFsApi(fsPath('read-text', path));
}
// Save UTF-8 text back to a file. Local writes go through the hardened Electron
// IPC; remote writes hit the dashboard's POST /api/fs/write-text (same path
// hardening, parent-must-exist, size cap) so the editor behaves identically in
// both modes. Stale-on-disk detection is the caller's job (re-read before save).
export async function writeDesktopFileText(path, content) {
    const desktop = bridge();
    if (!isDesktopFsRemoteMode()) {
        if (!desktop.writeTextFile) {
            throw new Error('Saving is not available');
        }
        return desktop.writeTextFile(path, content);
    }
    const result = await remoteFsApi('/api/fs/write-text', { content, path });
    return { path: result.path || path };
}
export async function readDesktopFileDataUrl(path) {
    if (!isDesktopFsRemoteMode()) {
        return bridge().readFileDataUrl(path);
    }
    const result = await remoteFsApi(fsPath('read-data-url', path));
    return typeof result === 'string' ? result : result.dataUrl || '';
}
export async function desktopGitRoot(path) {
    const desktop = bridge();
    if (!isDesktopFsRemoteMode()) {
        return desktop.gitRoot ? desktop.gitRoot(path) : null;
    }
    return (await remoteFsApi(fsPath('git-root', path))).root;
}
export async function desktopDefaultCwd() {
    if (!isDesktopFsRemoteMode()) {
        return null;
    }
    return remoteFsApi('/api/fs/default-cwd');
}
// Reveal a path in the OS file manager (Finder / Explorer / Files). Local only.
export async function revealDesktopPath(path) {
    await bridge().revealPath?.(path);
}
// Rename a file/folder in place; returns the new absolute path. Local only.
export async function renameDesktopPath(path, newName) {
    const desktop = bridge();
    if (!desktop.renamePath) {
        throw new Error('Rename is not available');
    }
    const result = await desktop.renamePath(path, newName);
    return result.path;
}
// Move a file/folder to the OS trash (recoverable). Local only.
export async function trashDesktopPath(path) {
    const desktop = bridge();
    if (!desktop.trashPath) {
        throw new Error('Delete is not available');
    }
    await desktop.trashPath(path);
}
export async function copyTextToClipboard(text) {
    await bridge().writeClipboard(text);
}
// Working-tree-vs-HEAD diff for one file. Empty when unchanged / not a repo.
// Remote gateway → backend git (/api/git/file-diff); local → Electron git.
export async function desktopFileDiff(repoRoot, filePath) {
    if (isDesktopFsRemoteMode()) {
        const result = await remoteFsApi(`/api/git/file-diff?path=${encodeURIComponent(repoRoot)}&file=${encodeURIComponent(filePath)}`);
        return result.diff || '';
    }
    const git = bridge().git;
    return git?.fileDiff ? git.fileDiff(repoRoot, filePath) : '';
}
export async function selectDesktopPaths(options) {
    const desktop = bridge();
    if (!isDesktopFsRemoteMode()) {
        return desktop.selectPaths(options);
    }
    if (!options?.directories) {
        return desktop.selectPaths(options);
    }
    return remotePicker ? remotePicker.selectPaths({ ...options, multiple: false }) : [];
}
