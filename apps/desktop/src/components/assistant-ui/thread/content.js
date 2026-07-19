const EMPTY_ATTACHMENT_REFS = [];
export function partText(part) {
    if (typeof part === 'string') {
        return part;
    }
    if (!part || typeof part !== 'object') {
        return '';
    }
    const row = part;
    return (!row.type || row.type === 'text') && typeof row.text === 'string' ? row.text : '';
}
export function messageContentText(content) {
    if (typeof content === 'string') {
        return content.trim();
    }
    return Array.isArray(content) ? content.map(partText).join('').trim() : '';
}
// Cheap streaming-stable "does this message have visible text" check: returns
// on the first non-whitespace text part without concatenating the whole
// message. Used as a useAuiState selector so its boolean output stays stable
// across token flushes (flips false→true once per turn).
export function contentHasVisibleText(content) {
    if (typeof content === 'string') {
        return content.trim().length > 0;
    }
    if (!Array.isArray(content)) {
        return false;
    }
    for (const part of content) {
        if (partText(part).trim().length > 0) {
            return true;
        }
    }
    return false;
}
export function messageAttachmentRefs(value) {
    if (!Array.isArray(value)) {
        return EMPTY_ATTACHMENT_REFS;
    }
    return value.every(ref => typeof ref === 'string') ? value : EMPTY_ATTACHMENT_REFS;
}
export function pickPrimaryPreviewTarget(targets) {
    if (targets.length <= 1) {
        return targets;
    }
    const localUrl = targets.find(value => /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(value));
    return [localUrl || targets[targets.length - 1]];
}
