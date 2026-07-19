/**
 * Helpers for the contenteditable composer surface: serialize refs to chip
 * HTML, walk the DOM back to plain `@kind:value` text, and place the caret.
 *
 * Chip values are always wrapped in backticks/quotes so REF_RE stops at the
 * fence — without that, typing after a chip would get re-absorbed on the next
 * plain-text round-trip.
 */
import { DIRECTIVE_CHIP_CLASS, directiveIconElement, directiveIconSvg, formatRefValue, slashChipClass, slashIconElement } from '@/components/assistant-ui/directive-text';
export const RICH_INPUT_SLOT = 'composer-rich-input';
export const REF_RE = /@(file|folder|url|image|tool|line|terminal|session):(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
export function escapeHtml(value) {
    return value.replace(/[&<>"']/g, ch => ESC[ch] || ch);
}
export function unquoteRef(raw) {
    const head = raw[0];
    const tail = raw[raw.length - 1];
    const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'");
    return quoted ? raw.slice(1, -1) : raw.replace(/[,.;!?]+$/, '');
}
export function refLabel(id) {
    return id.split(/[\\/]/).filter(Boolean).pop() || id;
}
/** Always-quote variant of formatRefValue — chips need a fence even for safe values. */
export function quoteRefValue(value) {
    if (!value.includes('`')) {
        return `\`${value}\``;
    }
    if (!value.includes('"')) {
        return `"${value}"`;
    }
    if (!value.includes("'")) {
        return `'${value}'`;
    }
    return formatRefValue(value);
}
export function refChipHtml(kind, rawValue, displayLabel) {
    const id = unquoteRef(rawValue);
    const text = `@${kind}:${quoteRefValue(id)}`;
    return `<span contenteditable="false" data-ref-text="${escapeHtml(text)}" data-ref-id="${escapeHtml(id)}" data-ref-kind="${escapeHtml(kind)}" class="${DIRECTIVE_CHIP_CLASS}">${directiveIconSvg(kind)}<span class="truncate">${escapeHtml(displayLabel || refLabel(id))}</span></span>`;
}
export function refChipElement(kind, rawValue, displayLabel) {
    const id = unquoteRef(rawValue);
    const text = `@${kind}:${quoteRefValue(id)}`;
    const chip = document.createElement('span');
    const label = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.refText = text;
    chip.dataset.refId = id;
    chip.dataset.refKind = kind;
    chip.className = DIRECTIVE_CHIP_CLASS;
    label.className = 'truncate';
    label.textContent = displayLabel || refLabel(id);
    chip.append(directiveIconElement(kind), label);
    return chip;
}
/** A non-editable pill for a picked slash command (`/skin nous`, `/tropes`).
 *  `data-ref-text` carries the literal command so `composerPlainText` round-trips
 *  it back to the exact text that gets submitted. */
export function slashChipElement(command, kind, label) {
    const chip = document.createElement('span');
    const text = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.refText = command;
    chip.dataset.slashKind = kind;
    chip.className = slashChipClass(kind);
    text.className = 'truncate';
    text.textContent = label || command;
    chip.append(slashIconElement(kind), text);
    return chip;
}
function appendTextWithBreaks(target, text) {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (index > 0) {
            target.append(document.createElement('br'));
        }
        if (line) {
            target.append(document.createTextNode(line));
        }
    });
}
export function appendComposerContents(target, text) {
    let cursor = 0;
    REF_RE.lastIndex = 0;
    for (const match of text.matchAll(REF_RE)) {
        const index = match.index ?? 0;
        appendTextWithBreaks(target, text.slice(cursor, index));
        target.append(refChipElement(match[1] || 'file', match[2] || ''));
        cursor = index + match[0].length;
    }
    appendTextWithBreaks(target, text.slice(cursor));
}
export function renderComposerContents(target, text) {
    target.replaceChildren();
    appendComposerContents(target, text);
}
/** Caret range when the selection lives inside `editor`; else null. */
function composerSelectionRange(editor) {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || !range || !editor.contains(range.commonAncestorContainer)) {
        return null;
    }
    return { range, selection };
}
/** Insert plain text at the caret (replacing any selection). Pastes use this
 *  instead of `execCommand('insertText')` — Chromium's editing pipeline is
 *  ~O(n²) on large multiline blobs. */
export function insertPlainTextAtCaret(editor, text) {
    const hit = composerSelectionRange(editor);
    const fragment = document.createDocumentFragment();
    appendTextWithBreaks(fragment, text);
    const tail = fragment.lastChild;
    if (hit) {
        hit.range.deleteContents();
        hit.range.insertNode(fragment);
    }
    else {
        editor.append(fragment);
    }
    if (tail) {
        const caret = document.createRange();
        caret.setStartAfter(tail);
        caret.collapse(true);
        const selection = hit?.selection ?? window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(caret);
    }
}
/** Backspace at a collapsed caret immediately after a chip: delete the chip AND
 *  the single trailing space we auto-insert after it, atomically — so removing a
 *  directive never strands an orphaned space (the contenteditable-driven cleanup
 *  was unreliable). Returns whether it ran. */
export function deleteChipBeforeCaret(editor) {
    const hit = composerSelectionRange(editor);
    if (!hit || !hit.range.collapsed) {
        return false;
    }
    const { startContainer, startOffset } = hit.range;
    let chip = null;
    if (startContainer === editor) {
        chip = startOffset > 0 ? editor.childNodes[startOffset - 1] : null;
    }
    else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        chip = startContainer.previousSibling;
    }
    if (chip?.nodeType !== Node.ELEMENT_NODE || !chip.dataset.refText) {
        return false;
    }
    const after = chip.nextSibling;
    chip.remove();
    // Drop the auto-inserted trailing space; keep any real following text.
    if (after?.nodeType === Node.TEXT_NODE) {
        const text = after.textContent ?? '';
        if (text === ' ') {
            after.remove();
        }
        else if (text.startsWith(' ')) {
            after.textContent = text.slice(1);
        }
    }
    const caret = document.createRange();
    if (after?.isConnected) {
        caret.setStartBefore(after);
    }
    else {
        caret.selectNodeContents(editor);
        caret.collapse(false);
    }
    caret.collapse(true);
    hit.selection.removeAllRanges();
    hit.selection.addRange(caret);
    return true;
}
/** Remove a non-collapsed selection in-editor. Skips collapsed carets so word/
 *  line delete (Opt/Cmd+Backspace) stays native. Returns whether anything ran. */
export function deleteSelectionInEditor(editor) {
    const hit = composerSelectionRange(editor);
    if (!hit || hit.range.collapsed) {
        return false;
    }
    hit.range.deleteContents();
    hit.range.collapse(true);
    hit.selection.removeAllRanges();
    hit.selection.addRange(hit.range);
    return true;
}
/** Serialize a draft string into chip-HTML for the contenteditable surface. */
export function composerHtml(text) {
    let cursor = 0;
    let html = '';
    REF_RE.lastIndex = 0;
    for (const match of text.matchAll(REF_RE)) {
        const index = match.index ?? 0;
        html += escapeHtml(text.slice(cursor, index)).replace(/\n/g, '<br>');
        html += refChipHtml(match[1] || 'file', match[2] || '');
        cursor = index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor)).replace(/\n/g, '<br>');
}
/** Walk a DOM subtree back to the plain `@kind:value` text it represents. */
export function composerPlainText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
    }
    const el = node;
    if (el.dataset.refText) {
        return el.dataset.refText;
    }
    if (el.tagName === 'BR') {
        return '\n';
    }
    const text = Array.from(node.childNodes).map(composerPlainText).join('');
    const block = el.tagName === 'DIV' || el.tagName === 'P';
    return block && text && el.dataset.slot !== RICH_INPUT_SLOT ? `${text}\n` : text;
}
export function placeCaretEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
}
/** Nothing but a break / whitespace (recursively) — i.e. no real text or chip. */
function isBlankNode(node) {
    if (!node) {
        return false;
    }
    if (node.nodeName === 'BR') {
        return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
        return !(node.textContent || '').trim();
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        return !el.dataset.refText && Array.from(el.childNodes).every(isBlankNode);
    }
    return false;
}
/** Drop contenteditable junk that serializes as `\n` and falsely expands the
 *  composer. Editing around a contenteditable=false chip makes Chromium wrap the
 *  remainder in stray block <div>s / trailing <br>s — none of which our own
 *  rendering emits (we use text nodes + <br> + chips). Real <br> line breaks
 *  (Shift+Enter, which sit after actual text) are preserved. */
export function normalizeComposerEditorDom(editor) {
    // A trailing block wrapper holding only a break/whitespace is the phantom
    // "new line" Chromium adds after a chip on backspace — drop it.
    const tailBlock = editor.lastChild;
    if (tailBlock?.nodeType === Node.ELEMENT_NODE &&
        (tailBlock.tagName === 'DIV' || tailBlock.tagName === 'P') &&
        isBlankNode(tailBlock)) {
        editor.removeChild(tailBlock);
    }
    // Unwrap a lone block wrapper back to inline content.
    if (editor.childNodes.length === 1 && editor.firstChild?.nodeType === Node.ELEMENT_NODE) {
        const wrapper = editor.firstChild;
        if ((wrapper.tagName === 'DIV' || wrapper.tagName === 'P') && wrapper.dataset.slot !== RICH_INPUT_SLOT) {
            editor.replaceChildren(...Array.from(wrapper.childNodes));
        }
    }
    // A trailing <br> right after a chip / only whitespace is a phantom line.
    const last = editor.lastChild;
    if (last?.nodeName === 'BR') {
        let prev = last.previousSibling;
        while (prev?.nodeType === Node.TEXT_NODE && !(prev.textContent || '').trim()) {
            prev = prev.previousSibling;
        }
        if (!prev || prev.dataset?.refText) {
            editor.removeChild(last);
        }
    }
}
