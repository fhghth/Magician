/**
 * Pure copy-selection for the updates overlay's "available" state.
 *
 * Names the update target (client vs the connected backend in remote mode) and
 * degrades honestly when there's no commit changelog to show (e.g. a pip /
 * non-git backend where `git log` yields nothing) instead of generic filler.
 *
 * Extracted from updates-overlay.tsx so the wording logic is unit-testable.
 */
export function resolveUpdateCopy({ target, shownItems, copy }) {
    const title = target === 'backend' ? copy.availableTitleBackend : copy.availableTitle;
    const body = shownItems === 0
        ? copy.availableBodyNoChangelog
        : target === 'backend'
            ? copy.availableBodyBackend
            : copy.availableBody;
    return { title, body };
}
