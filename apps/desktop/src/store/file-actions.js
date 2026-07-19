import { atom } from 'nanostores';
import { translateNow } from '@/i18n';
import { copyTextToClipboard, renameDesktopPath, revealDesktopPath, trashDesktopPath } from '@/lib/desktop-fs';
import { notify, notifyError } from '@/store/notifications';
import { notifyWorkspaceChanged } from '@/store/workspace-events';
export const $fileActionDialog = atom(null);
export function requestFileDelete(target) {
    $fileActionDialog.set({ kind: 'delete', ...target });
}
export function closeFileActionDialog() {
    $fileActionDialog.set(null);
}
// Absolute path of the row currently being renamed inline, or null. A row whose
// path matches renders an edit input in place of its label; F2 / Enter (on a
// focused row) and the context-menu "Rename" all set this.
export const $renamingPath = atom(null);
export function beginInlineRename(path) {
    $renamingPath.set(path);
}
export function cancelInlineRename() {
    $renamingPath.set(null);
}
// ── Direct (no-dialog) actions ───────────────────────────────────────────────
export async function revealFile(path) {
    try {
        await revealDesktopPath(path);
    }
    catch (error) {
        notifyError(error, translateNow('errors.genericFailure'));
    }
}
export async function copyFilePath(path) {
    try {
        await copyTextToClipboard(path);
        notify({ durationMs: 1500, kind: 'info', message: translateNow('fileMenu.pathCopied') });
    }
    catch (error) {
        notifyError(error, translateNow('common.copyFailed'));
    }
}
/** Strip a `relativeTo` prefix to produce a repo/cwd-relative path. */
export function toRelativePath(path, relativeTo) {
    const base = relativeTo.replace(/[\\/]+$/, '');
    if (path === base) {
        return path;
    }
    return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`) ? path.slice(base.length + 1) : path;
}
// ── Dialog-confirmed mutations (called by FileActionDialogs) ──────────────────
export async function executeFileRename(path, newName) {
    await renameDesktopPath(path, newName);
    notifyWorkspaceChanged();
}
export async function executeFileDelete(path) {
    await trashDesktopPath(path);
    notifyWorkspaceChanged();
}
