import { jsx as _jsx } from "react/jsx-runtime";
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $currentFastMode, $currentModel, $currentProvider, $currentReasoningEffort, $currentServiceTier, $messages, $turnStartedAt, setCurrentFastMode, setCurrentModel, setCurrentProvider, setCurrentReasoningEffort, setCurrentServiceTier, setTurnStartedAt } from '@/store/session';
import { useSessionStateCache } from './use-session-state-cache';
function Harness({ activeSessionId, onReady, selectedStoredSessionId }) {
    const busyRef = { current: false };
    const cache = useSessionStateCache({
        activeSessionId,
        busyRef,
        selectedStoredSessionId,
        setAwaitingResponse: () => undefined,
        setBusy: () => undefined,
        setMessages: () => undefined
    });
    onReady(cache);
    return null;
}
describe('useSessionStateCache — per-session turn timer', () => {
    beforeEach(() => {
        // The view-sync flush runs on a real rAF in the browser path; in jsdom we
        // want it synchronous so the global mirror is observable immediately. The
        // hook closes over `window.requestAnimationFrame`, so stub that exact ref.
        // Return null (not a handle) so the hook's `viewSyncRafRef.current = rAF(...)`
        // assignment doesn't overwrite the null the synchronous callback just set —
        // otherwise the ref reads truthy and the NEXT sync is suppressed (a real
        // browser returns a handle but runs the callback async, so this race is a
        // test-only artifact of firing synchronously).
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0);
            return null;
        });
        setTurnStartedAt(null);
        setCurrentModel('');
        setCurrentProvider('');
        setCurrentReasoningEffort('');
        setCurrentServiceTier('');
        setCurrentFastMode(false);
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        setTurnStartedAt(null);
        setCurrentModel('');
        setCurrentProvider('');
        setCurrentReasoningEffort('');
        setCurrentServiceTier('');
        setCurrentFastMode(false);
    });
    it("keeps a background session's running turn clock and never mirrors it to the view", () => {
        let cache;
        // Active session is "fg-runtime"; the turn starts on the BACKGROUND session.
        render(_jsx(Harness, { activeSessionId: "fg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "fg-stored" }));
        const startedAt = 1_700_000_000_000;
        act(() => {
            cache.updateSessionState('bg-runtime', state => ({ ...state, busy: true, turnStartedAt: startedAt }), 'bg-stored');
        });
        // The background session's own cache entry holds the clock...
        expect(cache.sessionStateByRuntimeIdRef.current.get('bg-runtime')?.turnStartedAt).toBe(startedAt);
        // ...but the global atom (statusbar timer) is untouched — a background turn
        // must not drive the foreground timer.
        expect($turnStartedAt.get()).toBeNull();
    });
    it("mirrors the focused session's turn clock into the global atom on view-sync", () => {
        let cache;
        render(_jsx(Harness, { activeSessionId: "fg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "fg-stored" }));
        const startedAt = 1_700_000_111_000;
        // A turn on the ACTIVE session stages into the view; the flush mirrors its
        // turnStartedAt into the global atom the statusbar reads.
        act(() => {
            cache.updateSessionState('fg-runtime', state => ({ ...state, busy: true, turnStartedAt: startedAt }), 'fg-stored');
        });
        expect($turnStartedAt.get()).toBe(startedAt);
    });
    it('clears the global clock when the focused turn ends', () => {
        let cache;
        render(_jsx(Harness, { activeSessionId: "fg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "fg-stored" }));
        act(() => {
            cache.updateSessionState('fg-runtime', state => ({ ...state, busy: true, turnStartedAt: 1_700_000_222_000 }), 'fg-stored');
        });
        expect($turnStartedAt.get()).toBe(1_700_000_222_000);
        act(() => {
            cache.updateSessionState('fg-runtime', state => ({ ...state, busy: false, turnStartedAt: null }));
        });
        expect($turnStartedAt.get()).toBeNull();
    });
    it('mirrors the focused session model metadata when switching from a cached session', () => {
        let cache;
        const { rerender } = render(_jsx(Harness, { activeSessionId: "fg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "fg-stored" }));
        act(() => {
            cache.updateSessionState('bg-runtime', state => ({
                ...state,
                fast: true,
                model: 'anthropic/claude-opus-4.8',
                provider: 'anthropic',
                reasoningEffort: 'high',
                serviceTier: 'priority'
            }), 'bg-stored');
        });
        // Background metadata is cached but must not bleed into the visible statusbar.
        expect($currentModel.get()).toBe('');
        expect($currentReasoningEffort.get()).toBe('');
        expect($currentFastMode.get()).toBe(false);
        rerender(_jsx(Harness, { activeSessionId: "bg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "bg-stored" }));
        const bgState = cache.sessionStateByRuntimeIdRef.current.get('bg-runtime');
        expect(bgState).toBeTruthy();
        act(() => {
            cache.syncSessionStateToView('bg-runtime', bgState);
        });
        expect($currentModel.get()).toBe('anthropic/claude-opus-4.8');
        expect($currentProvider.get()).toBe('anthropic');
        expect($currentReasoningEffort.get()).toBe('high');
        expect($currentServiceTier.get()).toBe('priority');
        expect($currentFastMode.get()).toBe(true);
    });
    it('clears stale model metadata when the newly focused session has no cached value', () => {
        setCurrentModel('previous-model');
        setCurrentProvider('previous-provider');
        setCurrentReasoningEffort('high');
        setCurrentServiceTier('priority');
        setCurrentFastMode(true);
        let cache;
        const { rerender } = render(_jsx(Harness, { activeSessionId: "fg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "fg-stored" }));
        act(() => {
            cache.updateSessionState('bg-runtime', state => ({ ...state }), 'bg-stored');
        });
        rerender(_jsx(Harness, { activeSessionId: "bg-runtime", onReady: c => (cache = c), selectedStoredSessionId: "bg-stored" }));
        const bgState = cache.sessionStateByRuntimeIdRef.current.get('bg-runtime');
        expect(bgState).toBeTruthy();
        act(() => {
            cache.syncSessionStateToView('bg-runtime', bgState);
        });
        expect($currentModel.get()).toBe('');
        expect($currentProvider.get()).toBe('');
        expect($currentReasoningEffort.get()).toBe('');
        expect($currentServiceTier.get()).toBe('');
        expect($currentFastMode.get()).toBe(false);
    });
});
function userMessage(id, text) {
    return { id, role: 'user', parts: [{ type: 'text', text }] };
}
function assistantText(id, text) {
    return { id, role: 'assistant', parts: [{ type: 'text', text }] };
}
function assistantError(id, error) {
    return { id, role: 'assistant', parts: [], error, pending: false };
}
function ViewHarness({ activeSessionId, onReady }) {
    const busyRef = { current: false };
    const cache = useSessionStateCache({
        activeSessionId,
        busyRef,
        selectedStoredSessionId: null,
        setAwaitingResponse: () => undefined,
        setBusy: () => undefined,
        // Wire the published view back into the real $messages atom the flush
        // reads from, so the round-trip matches production.
        setMessages: messages => $messages.set(messages)
    });
    onReady(cache);
    return null;
}
describe('useSessionStateCache — cross-thread error isolation', () => {
    afterEach(() => {
        cleanup();
        $messages.set([]);
    });
    it('does not leak a failed turn into another thread on switch', () => {
        $messages.set([]);
        let cache;
        const { rerender } = render(_jsx(ViewHarness, { activeSessionId: "thread-A", onReady: c => (cache = c) }));
        // Thread A ends its turn with an out-of-funds error and is on screen.
        act(() => {
            cache.updateSessionState('thread-A', state => ({
                ...state,
                busy: false,
                messages: [userMessage('user-a', 'do the thing'), assistantError('assistant-a-error', 'Out of funds')]
            }), 'stored-A');
        });
        expect($messages.get().some(message => message.error === 'Out of funds')).toBe(true);
        // Switch to thread B (which completed cleanly). Its cached state syncs to
        // the view while $messages still holds thread A's transcript.
        rerender(_jsx(ViewHarness, { activeSessionId: "thread-B", onReady: c => (cache = c) }));
        act(() => {
            cache.updateSessionState('thread-B', state => ({
                ...state,
                busy: false,
                messages: [userMessage('user-b', 'hello'), assistantText('assistant-b', 'hi there')]
            }), 'stored-B');
        });
        expect($messages.get().map(message => message.id)).toEqual(['user-b', 'assistant-b']);
        expect($messages.get().some(message => message.error === 'Out of funds')).toBe(false);
    });
    it('still preserves a same-session local error a heartbeat dropped', () => {
        $messages.set([]);
        let cache;
        render(_jsx(ViewHarness, { activeSessionId: "thread-A", onReady: c => (cache = c) }));
        // First paint establishes thread A as the on-screen session.
        act(() => {
            cache.updateSessionState('thread-A', state => ({ ...state, busy: false, messages: [userMessage('user-a', 'do the thing')] }), 'stored-A');
        });
        // A local error lands in the view (e.g. failAssistantMessage wrote it).
        $messages.set([userMessage('user-a', 'do the thing'), assistantError('assistant-a-error', 'OpenRouter 403')]);
        // A later same-session heartbeat carries cached state that lost the error.
        act(() => {
            cache.updateSessionState('thread-A', state => ({
                ...state,
                busy: false,
                messages: [userMessage('user-a', 'do the thing')]
            }));
        });
        expect($messages.get().some(message => message.error === 'OpenRouter 403')).toBe(true);
    });
});
