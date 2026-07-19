import { useEffect, useRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';
/**
 * Global Esc-to-cancel: stop the in-flight turn when the CHAT (not the composer
 * input, which has its own handler) has focus — clicking into the transcript and
 * hitting Esc stops the run, matching the Stop button. A latest-handler ref keeps
 * the window listener registered exactly once while still reading fresh
 * busy/awaitingInput/onCancel each press.
 */
export function useComposerEscCancel({ awaitingInput, busy, onCancel }) {
    // Intentional only: we bail if (a) the composer/another field already handled
    // Esc (defaultPrevented), (b) focus is in any input/textarea/contenteditable
    // (you're typing, not stopping), or (c) a dialog/popover is open — Esc must
    // close that overlay, never double as canceling the stream behind it.
    const escCancelRef = useRef(() => { });
    escCancelRef.current = (event) => {
        // `awaitingInput`: the turn is parked on a clarify / approval / sudo / secret
        // prompt, which owns Esc (or is meant to persist) — never cancel the stream
        // out from under it.
        if (event.key !== 'Escape' || event.defaultPrevented || !busy || awaitingInput) {
            return;
        }
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }
        if (document.querySelector('[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]')) {
            return;
        }
        event.preventDefault();
        triggerHaptic('cancel');
        void Promise.resolve(onCancel());
    };
    useEffect(() => {
        const onKeyDown = (event) => escCancelRef.current(event);
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}
