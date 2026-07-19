// Pure timeline helpers — no React/DOM; tested in thread-timeline-data.test.ts.
// Injected as user messages for alternation; not human prompts (thread.tsx).
const PROCESS_NOTIFICATION_RE = /^\[IMPORTANT: Background process [\s\S]*\]$/;
const PREVIEW_MAX = 120;
export function timelinePreview(text, max = PREVIEW_MAX) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= max) {
        return collapsed;
    }
    return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}
export function deriveTimelineEntries(messages) {
    const entries = [];
    for (const message of messages) {
        if (message.role !== 'user') {
            continue;
        }
        const text = message.text.trim();
        if (!text || PROCESS_NOTIFICATION_RE.test(text)) {
            continue;
        }
        entries.push({ id: message.id, preview: timelinePreview(text) });
    }
    return entries;
}
/** Last user prompt at/above the viewport top (with slack); else first rendered. */
export function activeTimelineIndex(offsets, slack = 8) {
    let active = -1;
    let firstRendered = -1;
    for (let i = 0; i < offsets.length; i++) {
        const offset = offsets[i];
        if (offset == null) {
            continue;
        }
        if (firstRendered === -1) {
            firstRendered = i;
        }
        if (offset <= slack) {
            active = i;
        }
    }
    if (active !== -1) {
        return active;
    }
    return firstRendered === -1 ? 0 : firstRendered;
}
