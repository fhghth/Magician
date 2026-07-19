import { jsx as _jsx } from "react/jsx-runtime";
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetElapsedTimerRegistryForTests, useElapsedSeconds } from './activity-timer';
function Probe({ active, timerKey }) {
    const elapsed = useElapsedSeconds(active, timerKey);
    return _jsx("span", { "data-testid": "elapsed", children: elapsed });
}
describe('useElapsedSeconds', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        __resetElapsedTimerRegistryForTests();
    });
    afterEach(() => {
        vi.useRealTimers();
        __resetElapsedTimerRegistryForTests();
    });
    it('keeps elapsed time stable across remounts for the same key', () => {
        const first = render(_jsx(Probe, { active: true, timerKey: "tool:abc" }));
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(screen.getByTestId('elapsed').textContent).toBe('5');
        first.unmount();
        act(() => {
            vi.advanceTimersByTime(3_000);
        });
        render(_jsx(Probe, { active: true, timerKey: "tool:abc" }));
        expect(screen.getByTestId('elapsed').textContent).toBe('8');
    });
});
