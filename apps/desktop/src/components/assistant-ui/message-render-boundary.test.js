import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageRenderBoundary } from './message-render-boundary';
afterEach(cleanup);
function Boom({ error }) {
    if (error) {
        throw error;
    }
    return null;
}
const lookupError = new Error('tapClientLookup: Index 2 out of bounds (length: 2)');
describe('MessageRenderBoundary', () => {
    it('renders children when nothing throws', () => {
        render(_jsx(MessageRenderBoundary, { resetKey: "a", children: _jsx("div", { children: "content" }) }));
        expect(screen.getByText('content')).toBeTruthy();
    });
    it('swallows the transient tapClientLookup out-of-bounds store race', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { container } = render(_jsx(MessageRenderBoundary, { resetKey: "a", children: _jsx(Boom, { error: lookupError }) }));
        expect(container.innerHTML).toBe('');
        spy.mockRestore();
    });
    it('recovers on the next consistent snapshot when resetKey changes', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { rerender } = render(_jsx(MessageRenderBoundary, { resetKey: "a", children: _jsx(Boom, { error: lookupError }) }));
        rerender(_jsx(MessageRenderBoundary, { resetKey: "b", children: _jsx(Boom, { error: null }) }));
        rerender(_jsx(MessageRenderBoundary, { resetKey: "b", children: _jsx("div", { children: "recovered" }) }));
        expect(screen.getByText('recovered')).toBeTruthy();
        spy.mockRestore();
    });
    it('re-throws unrelated errors so real bugs still surface', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => render(_jsx(MessageRenderBoundary, { resetKey: "a", children: _jsx(Boom, { error: new Error('genuine render bug') }) }))).toThrow('genuine render bug');
        spy.mockRestore();
    });
});
