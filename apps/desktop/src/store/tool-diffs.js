import { atom } from 'nanostores';
const $toolDiffs = atom({});
export function recordToolDiff(toolCallId, diff) {
    if (!toolCallId || !diff) {
        return;
    }
    const current = $toolDiffs.get();
    if (current[toolCallId] === diff) {
        return;
    }
    $toolDiffs.set({ ...current, [toolCallId]: diff });
}
export function getToolDiff(toolCallId) {
    return toolCallId ? $toolDiffs.get()[toolCallId] || '' : '';
}
export const $toolInlineDiffs = $toolDiffs;
