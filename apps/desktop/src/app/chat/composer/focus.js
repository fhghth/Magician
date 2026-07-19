/**
 * Composer focus + external-insert bus.
 *
 * Mutations from outside the composer (sidebar attach, drag drop, terminal
 * Cmd+L, preview console, etc.) dispatch through here. Each composer subscribes
 * and routes the work back into its own ref/state.
 *
 * `dispatch` defers to a macrotask so synchronous click/keydown handlers
 * (react-arborist row focus, picker `node.select()`) finish first and don't
 * steal focus from the composer effect.
 */
import { RICH_INPUT_SLOT } from './rich-editor';
const FOCUS_EVENT = 'hermes:composer-focus';
const INSERT_EVENT = 'hermes:composer-insert';
const INSERT_REFS_EVENT = 'hermes:composer-insert-refs';
const SUBMIT_EVENT = 'hermes:composer-submit';
const VOICE_TOGGLE_EVENT = 'hermes:composer-voice-toggle';
let activeTarget = 'main';
const resolve = (target) => (target === 'active' ? activeTarget : target);
const dispatch = (name, detail) => {
    if (typeof window === 'undefined') {
        return;
    }
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 0);
};
const subscribe = (name, handler) => {
    if (typeof window === 'undefined') {
        return () => undefined;
    }
    const listener = (event) => {
        const detail = event.detail;
        if (detail) {
            handler(detail);
        }
    };
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
};
export const markActiveComposer = (target) => {
    activeTarget = target;
};
export const requestComposerFocus = (target = 'active') => dispatch(FOCUS_EVENT, { target: resolve(target) });
export const requestComposerInsert = (text, { mode = 'block', target = 'active' } = {}) => {
    const trimmed = text.trim();
    if (!trimmed) {
        return;
    }
    dispatch(INSERT_EVENT, { mode, target: resolve(target), text: trimmed });
};
export const onComposerFocusRequest = (handler) => subscribe(FOCUS_EVENT, ({ target }) => handler(target));
export const onComposerInsertRequest = (handler) => subscribe(INSERT_EVENT, handler);
/** Insert typed ref chips (carrying a display label) into a composer — the
 * structured cousin of {@link requestComposerInsert}, used for session links. */
export const requestComposerInsertRefs = (refs, { target = 'active' } = {}) => {
    if (refs.length) {
        dispatch(INSERT_REFS_EVENT, { refs, target: resolve(target) });
    }
};
export const onComposerInsertRefsRequest = (handler) => subscribe(INSERT_REFS_EVENT, handler);
/** Submit a prompt through a composer as if the user typed + sent it. Lets
 * external panels (e.g. the review pane's "let the agent ship it" button) hand
 * the agent a task without the user round-tripping through the input. */
export const requestComposerSubmit = (text, { target = 'active' } = {}) => {
    const trimmed = text.trim();
    if (trimmed) {
        dispatch(SUBMIT_EVENT, { target: resolve(target), text: trimmed });
    }
};
export const onComposerSubmitRequest = (handler) => subscribe(SUBMIT_EVENT, handler);
/** Toggle the active composer's voice conversation — the `composer.voice`
 *  hotkey (Ctrl+B) reaching into the composer that owns the voice state. */
export const requestVoiceToggle = () => dispatch(VOICE_TOGGLE_EVENT, { at: Date.now() });
export const onComposerVoiceToggleRequest = (handler) => subscribe(VOICE_TOGGLE_EVENT, () => handler());
/**
 * Focus a composer input across React commit + browser focus restore.
 *
 * The triple-call survives:
 *   - sync: contenteditable already mounted
 *   - rAF:  React just committed a `renderComposerContents` swap
 *   - 0ms:  browser focus reclaim from a click target inside an external panel
 */
export const focusComposerInput = (el) => {
    if (!el) {
        return;
    }
    const focus = () => el.focus({ preventScroll: true });
    focus();
    window.requestAnimationFrame(focus);
    window.setTimeout(focus, 0);
};
/** Drop focus from the main composer input (status-stack chrome, sidebar, etc.). */
export const blurComposerInput = () => {
    const el = document.querySelector(`[data-slot="${RICH_INPUT_SLOT}"]`);
    if (el && document.activeElement === el) {
        el.blur();
    }
};
