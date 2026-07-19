import { formatRefValue } from '@/components/assistant-ui/directive-text';
import { contextPath } from '@/lib/chat-runtime';
import { composerPlainText, normalizeComposerEditorDom, placeCaretEnd, refChipElement } from './rich-editor';
/** MIME for an in-app session drag (sidebar row → composer). */
export const HERMES_SESSION_MIME = 'application/x-hermes-session';
export function writeSessionDrag(transfer, payload) {
    transfer.setData(HERMES_SESSION_MIME, JSON.stringify(payload));
    transfer.effectAllowed = 'copy';
}
export function dragHasSession(transfer) {
    return Boolean(transfer) && Array.from(transfer.types || []).includes(HERMES_SESSION_MIME);
}
export function readSessionDrag(transfer) {
    const raw = transfer?.getData(HERMES_SESSION_MIME);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed.id ? { id: parsed.id, profile: parsed.profile || 'default', title: parsed.title || '' } : null;
    }
    catch {
        return null;
    }
}
/** Build a `@session:<profile>/<id>` chip. Value carries the metadata the agent
 * needs to resolve the link (session_search); label shows the friendly title. */
export function sessionInlineRef({ id, profile, title }) {
    return { kind: 'session', label: title || `chat ${id.slice(0, 8)}`, value: `${profile || 'default'}/${id}` };
}
export function dragHasAttachments(transfer, pathsMime) {
    if (!transfer) {
        return false;
    }
    if (Array.from(transfer.types || []).includes(pathsMime)) {
        return true;
    }
    if (Array.from(transfer.types || []).includes('Files')) {
        return true;
    }
    return Array.from(transfer.items || []).some(item => item.kind === 'file');
}
export function droppedFileInlineRef(candidate, cwd) {
    if (!candidate.path) {
        return null;
    }
    const rel = contextPath(candidate.path, cwd || '');
    if (candidate.line) {
        const { line, lineEnd } = candidate;
        const range = lineEnd && lineEnd > line ? `${line}-${lineEnd}` : `${line}`;
        return `@line:${formatRefValue(`${rel}:${range}`)}`;
    }
    const kind = candidate.isDirectory ? 'folder' : 'file';
    return `@${kind}:${formatRefValue(rel)}`;
}
/** Resolve a batch of drops to their inline `@file:`/`@line:`/`@folder:` refs,
 * dropping any that carry no path. */
export function droppedFileInlineRefs(candidates, cwd) {
    return candidates.map(candidate => droppedFileInlineRef(candidate, cwd)).filter((ref) => Boolean(ref));
}
function parseInlineRef(ref) {
    if (typeof ref !== 'string') {
        return { kind: ref.kind, label: ref.label, rawValue: ref.value };
    }
    const match = ref.match(/^@([^:]+):(.+)$/);
    if (!match) {
        return null;
    }
    return { kind: match[1] || 'file', rawValue: match[2] || '' };
}
function plainTextInRange(editor, range, edge) {
    const slice = range.cloneRange();
    slice.selectNodeContents(editor);
    if (edge === 'before') {
        slice.setEnd(range.startContainer, range.startOffset);
    }
    else {
        slice.setStart(range.endContainer, range.endOffset);
    }
    const container = document.createElement('div');
    container.appendChild(slice.cloneContents());
    return composerPlainText(container);
}
function buildRefFragment(refs, { needsBeforeSpace, needsAfterSpace }) {
    const fragment = document.createDocumentFragment();
    if (needsBeforeSpace) {
        fragment.append(document.createTextNode(' '));
    }
    refs.forEach((ref, index) => {
        if (index > 0) {
            fragment.append(document.createTextNode(' '));
        }
        fragment.append(refChipElement(ref.kind, ref.rawValue, ref.label));
    });
    if (needsAfterSpace) {
        fragment.append(document.createTextNode(' '));
    }
    return fragment;
}
export function insertInlineRefsIntoEditor(editor, refs) {
    const parsed = refs.map(parseInlineRef).filter((ref) => ref !== null);
    if (!parsed.length) {
        return null;
    }
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.getRangeAt(0)
        : null;
    if (range && selection) {
        const beforeText = plainTextInRange(editor, range, 'before');
        const afterText = plainTextInRange(editor, range, 'after');
        range.insertNode(buildRefFragment(parsed, {
            needsAfterSpace: afterText.length === 0 || !/^\s/.test(afterText),
            needsBeforeSpace: beforeText.length > 0 && !/\s$/.test(beforeText)
        }));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    else {
        const current = composerPlainText(editor);
        editor.append(buildRefFragment(parsed, {
            needsAfterSpace: true,
            needsBeforeSpace: current.length > 0 && !/\s$/.test(current)
        }));
        placeCaretEnd(editor);
    }
    normalizeComposerEditorDom(editor);
    return composerPlainText(editor);
}
