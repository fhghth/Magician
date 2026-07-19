import { jsx as _jsx } from "react/jsx-runtime";
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Thread } from '.';
const createdAt = new Date('2026-05-01T00:00:00.000Z');
const resizeObservers = new Set();
class TestResizeObserver {
    callback;
    target = null;
    constructor(callback) {
        this.callback = callback;
        resizeObservers.add(this);
    }
    observe(target) {
        this.target = target;
    }
    unobserve() { }
    disconnect() {
        resizeObservers.delete(this);
    }
    trigger(height) {
        if (!this.target) {
            return;
        }
        this.callback([
            {
                contentRect: { height },
                target: this.target
            }
        ], this);
    }
}
vi.stubGlobal('ResizeObserver', TestResizeObserver);
vi.stubGlobal('requestAnimationFrame', (callback) => window.setTimeout(() => callback(performance.now()), 0));
vi.stubGlobal('cancelAnimationFrame', (id) => window.clearTimeout(id));
Element.prototype.scrollTo = function scrollTo() { };
Element.prototype.animate = function animate() {
    return {
        cancel: () => { },
        finished: Promise.resolve()
    };
};
// jsdom returns 0 for offset*; some layout code reads those to size the
// viewport. Fall through to client* (which tests can override) or a sane
// default so message rows render with non-zero dimensions.
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
async function wait(ms) {
    await act(async () => {
        await new Promise(resolve => window.setTimeout(resolve, ms));
    });
}
function userMessage() {
    return {
        id: 'user-1',
        role: 'user',
        content: [{ type: 'text', text: 'Stream a response' }],
        attachments: [],
        createdAt,
        metadata: { custom: {} }
    };
}
function assistantMessage(text, running = true) {
    return {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', text }],
        status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
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
function assistantErrorMessage(error) {
    return {
        id: 'assistant-error-1',
        role: 'assistant',
        content: [],
        status: { type: 'incomplete', reason: 'error', error },
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
function assistantReasoningMessage(text, running = false) {
    return {
        id: 'assistant-reasoning-1',
        role: 'assistant',
        content: [{ type: 'reasoning', text }],
        status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
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
function assistantMultiReasoningMessage(texts) {
    return {
        id: 'assistant-reasoning-multi-1',
        role: 'assistant',
        content: texts.map(text => ({ type: 'reasoning', text })),
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
function assistantSeparatedReasoningMessage() {
    return {
        id: 'assistant-reasoning-separated-1',
        role: 'assistant',
        content: [
            { type: 'reasoning', text: ' Complete first thought.', status: { type: 'complete' } },
            { type: 'text', text: 'Interim answer.' },
            { type: 'reasoning', text: ' Streaming second thought.', status: { type: 'running' } }
        ],
        status: { type: 'running' },
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
function assistantTodoMessage(todos, running = true) {
    const suffix = todos.map(todo => `${todo.id}:${todo.status}`).join('|') || 'empty';
    return {
        id: `assistant-todo-${running ? 'running' : 'done'}-${suffix}`,
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'todo-1',
                toolName: 'todo',
                args: { todos },
                argsText: JSON.stringify({ todos }),
                ...(running ? {} : { result: { todos } })
            }
        ],
        status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
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
function assistantImageMessage(running = false) {
    return {
        id: `assistant-image-${running ? 'running' : 'done'}`,
        role: 'assistant',
        content: [
            {
                type: 'tool-call',
                toolCallId: 'image-1',
                toolName: 'image_generate',
                args: { prompt: 'draw a cat' },
                argsText: JSON.stringify({ prompt: 'draw a cat' }),
                ...(running ? {} : { result: { image: 'https://cdn.example/cat.png', success: true } })
            }
        ],
        status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
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
function StreamingHarness() {
    const [messages, setMessages] = useState([userMessage()]);
    const [isRunning, setIsRunning] = useState(true);
    useEffect(() => {
        const first = window.setTimeout(() => {
            setMessages([userMessage(), assistantMessage('first chunk')]);
        }, 50);
        const second = window.setTimeout(() => {
            setMessages([userMessage(), assistantMessage('first chunk second chunk')]);
        }, 500);
        const complete = window.setTimeout(() => {
            setMessages([userMessage(), assistantMessage('first chunk second chunk', false)]);
            setIsRunning(false);
        }, 700);
        return () => {
            window.clearTimeout(first);
            window.clearTimeout(second);
            window.clearTimeout(complete);
        };
    }, []);
    const runtime = useExternalStoreRuntime({
        messages,
        isRunning,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, { loading: isRunning && messages.at(-1)?.role !== 'assistant' ? 'response' : undefined }) }));
}
function TodoHarness({ message }) {
    const runtime = useExternalStoreRuntime({
        messages: [message],
        isRunning: message.status?.type === 'running',
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function MessageHarness({ message }) {
    const runtime = useExternalStoreRuntime({
        messages: [message],
        isRunning: false,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function RunningMessageHarness({ message }) {
    const runtime = useExternalStoreRuntime({
        messages: [message],
        isRunning: true,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function ReasoningHarness() {
    const runtime = useExternalStoreRuntime({
        messages: [assistantReasoningMessage(' The user is asking what this file is.')],
        isRunning: false,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function RunningReasoningHarness() {
    const runtime = useExternalStoreRuntime({
        messages: [assistantReasoningMessage('```ts\nconst answer = 42\n', true)],
        isRunning: true,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function GroupedReasoningHarness() {
    const runtime = useExternalStoreRuntime({
        messages: [assistantMultiReasoningMessage([' First thought.', ' Second thought.'])],
        isRunning: false,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, {}) }));
}
function IntroHarness() {
    const runtime = useExternalStoreRuntime({
        messages: [],
        isRunning: false,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, { intro: { personality: 'default', seed: 1 } }) }));
}
function DismissibleErrorHarness({ onDismissError }) {
    const runtime = useExternalStoreRuntime({
        messages: [assistantErrorMessage('OpenRouter rejected the request (403).')],
        isRunning: false,
        onNew: async () => { }
    });
    return (_jsx(AssistantRuntimeProvider, { runtime: runtime, children: _jsx(Thread, { onDismissError: onDismissError }) }));
}
describe('assistant-ui streaming renderer', () => {
    beforeEach(() => {
        resizeObservers.clear();
    });
    it('renders assistant text incrementally before completion', async () => {
        const { container } = render(_jsx(StreamingHarness, {}));
        expect(screen.getByRole('status', { name: 'Hermes is loading a response' })).toBeTruthy();
        await wait(80);
        await waitFor(() => {
            expect(container.textContent).toContain('first chunk');
        });
        expect(container.textContent).not.toContain('second chunk');
        expect(screen.queryByRole('status', { name: 'Hermes is loading a response' })).toBeNull();
        await wait(500);
        await waitFor(() => {
            expect(container.textContent).toContain('first chunk second chunk');
        });
        await wait(250);
        await waitFor(() => {
            expect(container.textContent).toContain('first chunk second chunk');
        });
    });
    it('does not render composer clearance for intro-only threads', () => {
        const { container } = render(_jsx(IntroHarness, {}));
        expect(container.querySelector('[data-slot="aui_composer-clearance"]')).toBeNull();
    });
    it('renders assistant provider errors inline', () => {
        render(_jsx(MessageHarness, { message: assistantErrorMessage('OpenRouter rejected the request (403).') }));
        expect(screen.getByRole('alert').textContent).toContain('OpenRouter rejected the request (403).');
    });
    it('omits the dismiss control when no onDismissError handler is supplied', () => {
        render(_jsx(MessageHarness, { message: assistantErrorMessage('OpenRouter rejected the request (403).') }));
        expect(screen.queryByRole('button', { name: 'Dismiss error' })).toBeNull();
    });
    it('invokes onDismissError with the errored message id when the dismiss control is clicked', () => {
        const onDismissError = vi.fn();
        render(_jsx(DismissibleErrorHarness, { onDismissError: onDismissError }));
        const dismiss = screen.getByRole('button', { name: 'Dismiss error' });
        fireEvent.click(dismiss);
        expect(onDismissError).toHaveBeenCalledTimes(1);
        expect(onDismissError).toHaveBeenCalledWith('assistant-error-1');
    });
    // Scroll behavior (follow-at-bottom, escape-on-scroll-up, re-engage) is owned
    // by the use-stick-to-bottom library and covered by its own test suite. We
    // don't re-assert its scrollTop mechanics here — doing so in jsdom (no real
    // layout, spring animation via rAF) only produces brittle change-detector
    // tests. The rendering/streaming-content tests below remain the contract.
    it('renders an incomplete streaming fenced code block as a code card', async () => {
        const { container } = render(_jsx(RunningMessageHarness, { message: assistantMessage('```ts\nconst answer = 42\n') }));
        await waitFor(() => {
            expect(container.querySelector('[data-slot="code-card"]')).toBeTruthy();
        });
        expect(container.textContent).toContain('const answer = 42');
        expect(container.textContent).not.toContain('```ts');
    });
    it('renders an incomplete streaming reasoning fenced code block as a code card', async () => {
        const { container } = render(_jsx(RunningReasoningHarness, {}));
        const ui = within(container);
        const thinkingToggle = ui.getByRole('button', { name: /thinking/i });
        if (thinkingToggle.getAttribute('aria-expanded') !== 'true') {
            fireEvent.click(thinkingToggle);
        }
        await waitFor(() => {
            expect(container.querySelector('[data-slot="code-card"]')).toBeTruthy();
        });
        await waitFor(() => {
            expect(container.querySelector('[data-slot="aui_reasoning-text"]')?.textContent).toContain('const answer = 42');
        });
        expect(container.textContent).not.toContain('```ts');
    });
    it('renders reasoning text without a leading token space', () => {
        const { container } = render(_jsx(ReasoningHarness, {}));
        const ui = within(container);
        fireEvent.click(ui.getByRole('button', { name: /thinking/i }));
        expect(container.querySelector('[data-slot="aui_reasoning-text"]')?.textContent).toBe('The user is asking what this file is.');
    });
    it('groups consecutive reasoning parts under one thinking disclosure', () => {
        const { container } = render(_jsx(GroupedReasoningHarness, {}));
        const disclosures = container.querySelectorAll('[data-slot="aui_thinking-disclosure"]');
        expect(disclosures.length).toBe(1);
        fireEvent.click(disclosures[0].querySelector('button'));
        const reasoningParts = container.querySelectorAll('[data-slot="aui_reasoning-text"]');
        expect(reasoningParts.length).toBe(2);
        expect(reasoningParts[0]?.textContent).toBe('First thought.');
        expect(reasoningParts[1]?.textContent).toBe('Second thought.');
    });
    it('does not reopen an earlier completed thinking group when a later group is running', () => {
        const { container } = render(_jsx(RunningMessageHarness, { message: assistantSeparatedReasoningMessage() }));
        const disclosures = container.querySelectorAll('[data-slot="aui_thinking-disclosure"]');
        expect(disclosures.length).toBe(2);
        expect(disclosures[0].querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
        expect(disclosures[1].querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
        expect(container.textContent).not.toContain('Complete first thought.');
        expect(container.textContent).toContain('Interim answer.');
    });
    it('does not render an inline todo panel — todos live in the composer status stack', () => {
        const { container } = render(_jsx(TodoHarness, { message: assistantTodoMessage([
                { content: 'Gather ingredients', id: 'prep', status: 'completed' },
                { content: 'Boil water', id: 'boil', status: 'in_progress' }
            ]) }));
        expect(container.querySelector('[data-slot="aui_todo-hoisted"]')).toBeNull();
    });
    it('renders completed image generation results in the tool slot', async () => {
        const { container } = render(_jsx(MessageHarness, { message: assistantImageMessage() }));
        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'Generated image' }).getAttribute('src')).toBe('https://cdn.example/cat.png');
        });
        expect(container.querySelector('[data-slot="aui_generated-image"]')).toBeTruthy();
        expect(screen.queryByRole('status', { name: /rendering image/i })).toBeNull();
    });
});
