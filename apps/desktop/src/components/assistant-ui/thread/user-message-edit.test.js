import { jsx as _jsx } from "react/jsx-runtime";
import { ExportedMessageRepository } from '@assistant-ui/core/internal';
// Clicking a user bubble must open the inline edit composer — through the
// app's incremental external-store runtime (which reimplements capability
// resolution, incl. `edit: onEdit !== undefined`) and the stock runtime.
//
// Note: this covers the React/runtime wiring only. The Electron-level failure
// mode (titlebar -webkit-app-region:drag swallowing clicks on *stuck* sticky
// bubbles) is not reproducible in jsdom — see USER_BUBBLE_BASE_CLASS's no-drag
// carve-out in thread.tsx.
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIncrementalExternalStoreRuntime } from '@/lib/incremental-external-store-runtime';
import { Thread } from '.';
const createdAt = new Date('2026-05-01T00:00:00.000Z');
class TestResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}
vi.stubGlobal('ResizeObserver', TestResizeObserver);
vi.stubGlobal('requestAnimationFrame', (callback) => window.setTimeout(() => callback(performance.now()), 0));
vi.stubGlobal('cancelAnimationFrame', (id) => window.clearTimeout(id));
Element.prototype.scrollTo = function scrollTo() { };
function stubOffsetDimension(prop, clientProp, fallback) {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get() {
            return previous?.get?.call(this) || this[clientProp] || fallback;
        }
    });
}
stubOffsetDimension('offsetWidth', 'clientWidth', 800);
stubOffsetDimension('offsetHeight', 'clientHeight', 600);
function userMessage() {
    return {
        id: 'user-1',
        role: 'user',
        content: [{ type: 'text', text: 'edit me please' }],
        attachments: [],
        createdAt,
        metadata: { custom: {} }
    };
}
function assistantMessage() {
    return {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        status: { type: 'complete', reason: 'stop' },
        createdAt,
        metadata: {
            unstable_state: null,
            unstable_annotations: [],
            unstable_data: [],
            steps: [],
            custom: {}
        }
    };
}
// Mirrors chat/index.tsx: incremental runtime + messageRepository + onEdit.
function IncrementalHarness({ onEdit }) {
    const repository = ExportedMessageRepository.fromArray([userMessage(), assistantMessage()]);
    const runtime = useIncrementalExternalStoreRuntime({
        messageRepository: repository,
        isRunning: false,
        setMessages: () => { },
        onNew: async () => { },
        onEdit,
        onCancel: async () => { },
        onReload: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
// Control: stock external store runtime.
function StockHarness({ onEdit }) {
    const runtime = useExternalStoreRuntime({
        messages: [userMessage(), assistantMessage()],
        isRunning: false,
        onNew: async () => { },
        onEdit
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
describe('click-to-edit user message', () => {
    it('opens the edit composer with the incremental runtime', async () => {
        const { container } = render(_jsx(IncrementalHarness, { onEdit: async () => { } }));
        const bubble = await screen.findByRole('button', { name: 'Edit message' });
        fireEvent.click(bubble);
        await waitFor(() => {
            expect(container.querySelector('[data-slot="aui_edit-composer-root"]')).toBeTruthy();
        });
    });
    it('opens the edit composer with the stock runtime', async () => {
        const { container } = render(_jsx(StockHarness, { onEdit: async () => { } }));
        const bubble = await screen.findByRole('button', { name: 'Edit message' });
        fireEvent.click(bubble);
        await waitFor(() => {
            expect(container.querySelector('[data-slot="aui_edit-composer-root"]')).toBeTruthy();
        });
    });
});
