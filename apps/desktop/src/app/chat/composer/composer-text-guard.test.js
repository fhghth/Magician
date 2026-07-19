import { jsx as _jsx } from "react/jsx-runtime";
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { useCallback, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(cleanup);
// Mirror of index.tsx's `useAui()` composer surface: composer() returns a
// runtime whose setText throws exactly like @assistant-ui/core when unbound.
function makeFakeAui(bound, applied) {
    const composer = {
        setText(value) {
            if (!bound.current) {
                throw new Error('Composer is not available');
            }
            applied.push(value);
        }
    };
    return { composer: () => composer };
}
function Harness({ bound, applied, onError }) {
    const aui = useRef(makeFakeAui(bound, applied)).current;
    // Verbatim mirror of the production `setComposerText` helper in index.tsx.
    const setComposerText = useCallback((value) => {
        try {
            aui.composer().setText(value);
        }
        catch {
            // Composer core not bound yet — swallow so the input stays usable.
        }
    }, [aui]);
    // A draft-restore-on-mount that fires while the core may still be unbound,
    // exactly like loadIntoComposer/clearDraft do on startup.
    try {
        setComposerText('restored draft');
    }
    catch (err) {
        onError(err);
    }
    return null;
}
describe('setComposerText guard (#49903)', () => {
    it('swallows the unbound-core throw at startup instead of crashing the renderer', () => {
        const applied = [];
        const bound = { current: false };
        const onError = vi.fn();
        expect(() => render(_jsx(Harness, { applied: applied, bound: bound, onError: onError }))).not.toThrow();
        // The guard absorbed the throw — nothing escaped to the renderer, and no
        // assistant-ui write landed (core was unbound).
        expect(onError).not.toHaveBeenCalled();
        expect(applied).toEqual([]);
    });
    it('writes through to the composer once the core is bound', () => {
        const applied = [];
        const bound = { current: true };
        const onError = vi.fn();
        act(() => {
            render(_jsx(Harness, { applied: applied, bound: bound, onError: onError }));
        });
        expect(onError).not.toHaveBeenCalled();
        expect(applied).toEqual(['restored draft']);
    });
});
