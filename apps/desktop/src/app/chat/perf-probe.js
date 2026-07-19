import { jsx as _jsx } from "react/jsx-runtime";
import { Profiler } from 'react';
import { $messages, setBusy, setMessages } from '@/store/session';
if (typeof window !== 'undefined' && !window.__PERF_PROBE__) {
    const samples = [];
    window.__PERF_PROBE__ = {
        samples,
        enabled: false,
        clear: () => {
            samples.length = 0;
        },
        summary: () => {
            const byId = new Map();
            for (const s of samples) {
                const k = `${s.id}:${s.phase}`;
                const arr = byId.get(k) ?? [];
                arr.push(s.actualDuration);
                byId.set(k, arr);
            }
            const out = {};
            for (const [k, arr] of byId) {
                arr.sort((a, b) => a - b);
                const total = arr.reduce((a, b) => a + b, 0);
                out[k] = {
                    count: arr.length,
                    total: Math.round(total * 100) / 100,
                    max: Math.round(arr[arr.length - 1] * 100) / 100,
                    p50: Math.round(arr[Math.floor(arr.length * 0.5)] * 100) / 100,
                    p95: Math.round(arr[Math.floor(arr.length * 0.95)] * 100) / 100
                };
            }
            return out;
        }
    };
}
const onRender = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    const probe = typeof window !== 'undefined' ? window.__PERF_PROBE__ : undefined;
    if (!probe || !probe.enabled) {
        return;
    }
    probe.samples.push({ id, phase, actualDuration, baseDuration, startTime, commitTime });
    if (probe.samples.length > 5000) {
        probe.samples.splice(0, probe.samples.length - 5000);
    }
};
if (typeof window !== 'undefined' && !window.__PERF_DRIVE__) {
    // Synthetic stream driver — pushes tokens through the live $messages atom so the
    // assistant-ui runtime + react tree sees them exactly as a real LLM stream would.
    // Used by scripts/measure-real-stream.mjs when no live LLM credit is available.
    let baseline = null;
    let activeHandle = null;
    const stop = () => {
        activeHandle = null;
        setBusy(false);
    };
    window.__PERF_DRIVE__ = {
        snapshotMsgs: () => $messages.get().length,
        reset: () => {
            activeHandle?.stop();
            if (baseline) {
                setMessages(baseline);
            }
            baseline = null;
            setBusy(false);
        },
        stream: ({ chunk = 'word ', intervalMs = 16, totalTokens = 400, 
        // Mimic `use-message-stream.scheduleDeltaFlush` — batch token deltas
        // into at-most one $messages update every `flushMinMs` ms, exactly as
        // the real gateway path does. With this on, the synthetic harness's
        // numbers actually reflect what a real LLM stream of the same token
        // rate would feel like. Set to 0 to bypass and apply every token
        // immediately (worst-case).
        flushMinMs = 0 } = {}) => {
            activeHandle?.stop();
            const current = $messages.get();
            if (!baseline) {
                baseline = current;
            }
            const msgId = `synthetic-${Date.now()}`;
            // Seed an empty assistant message — assistant-ui will see it grow.
            setMessages([
                ...current,
                {
                    id: msgId,
                    role: 'assistant',
                    parts: [{ type: 'text', text: '' }],
                    timestamp: Date.now(),
                    pending: true
                }
            ]);
            setBusy(true);
            let pushed = 0;
            let pendingDelta = '';
            let lastFlushAt = 0;
            let timer = null;
            let flushHandle = null;
            const applyDelta = (delta) => {
                if (!delta) {
                    return;
                }
                setMessages(prev => prev.map(m => {
                    if (m.id !== msgId) {
                        return m;
                    }
                    const head = m.parts.slice(0, -1);
                    const last = m.parts.at(-1);
                    const lastText = last && last.type === 'text' ? last.text : '';
                    return {
                        ...m,
                        parts: [...head, { type: 'text', text: lastText + delta }]
                    };
                }));
            };
            const flushNow = () => {
                flushHandle = null;
                lastFlushAt = performance.now();
                const delta = pendingDelta;
                pendingDelta = '';
                applyDelta(delta);
            };
            const scheduleFlush = () => {
                if (flushHandle !== null) {
                    return;
                }
                if (flushMinMs <= 0) {
                    flushNow();
                    return;
                }
                const since = performance.now() - lastFlushAt;
                const wait = Math.max(0, flushMinMs - since);
                flushHandle =
                    wait <= 0 && typeof requestAnimationFrame === 'function'
                        ? requestAnimationFrame(flushNow)
                        : setTimeout(flushNow, wait);
            };
            const handle = {
                stop: () => {
                    if (timer) {
                        clearTimeout(timer);
                    }
                    timer = null;
                    if (flushHandle !== null) {
                        clearTimeout(flushHandle);
                        cancelAnimationFrame?.(flushHandle);
                    }
                    flushHandle = null;
                    if (pendingDelta) {
                        applyDelta(pendingDelta);
                        pendingDelta = '';
                    }
                    activeHandle = null;
                    // Mark message finalized.
                    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, pending: false } : m)));
                    setBusy(false);
                }
            };
            activeHandle = handle;
            const tick = () => {
                if (activeHandle !== handle) {
                    return;
                }
                if (pushed >= totalTokens) {
                    if (pendingDelta) {
                        flushNow();
                    }
                    handle.stop();
                    return;
                }
                pushed += 1;
                if (flushMinMs > 0) {
                    pendingDelta += chunk;
                    scheduleFlush();
                }
                else {
                    applyDelta(chunk);
                }
                timer = setTimeout(tick, intervalMs);
            };
            timer = setTimeout(tick, intervalMs);
            return handle;
        }
    };
    // Suppress dead-import warning.
    void stop;
}
export function PerfProbe({ id, children }) {
    return (_jsx(Profiler, { id: id, onRender: onRender, children: children }));
}
