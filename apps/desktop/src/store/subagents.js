import { atom } from 'nanostores';
import { capitalize } from '@/lib/text';
const TERMINAL = new Set(['completed', 'failed', 'interrupted']);
const MAX_STREAM = 24;
const PREVIEW_MAX = 220;
const TOOL_PREVIEW_MAX = 96;
export const $subagentsBySession = atom({});
const isStr = (v) => typeof v === 'string';
const str = (v) => (isStr(v) ? v : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strList = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
const asStatus = (v) => v === 'completed' || v === 'failed' || v === 'interrupted' || v === 'queued' ? v : 'running';
const compact = (text, max = PREVIEW_MAX) => {
    const line = text.replace(/\s+/g, ' ').trim();
    if (!line) {
        return '';
    }
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const toolLabel = (name) => name.split('_').filter(Boolean).map(capitalize).join(' ') || name;
const formatTool = (name, preview = '') => {
    const snippet = compact(preview, TOOL_PREVIEW_MAX);
    return snippet ? `${toolLabel(name)}("${snippet}")` : toolLabel(name);
};
const asTail = (v) => Array.isArray(v)
    ? v
        .filter((item) => !!item && typeof item === 'object')
        .map(item => ({
        isError: item.is_error === true,
        preview: str(item.preview) || undefined,
        tool: str(item.tool) || undefined
    }))
    : [];
const idOf = (p) => str(p.subagent_id) || `${str(p.parent_id) || 'root'}:${num(p.task_index) ?? 0}:${str(p.goal)}`;
const appendStream = (stream, entry) => {
    const last = stream.at(-1);
    if (last?.kind === entry.kind && last.text === entry.text && last.isError === entry.isError) {
        return stream;
    }
    return [...stream, entry].slice(-MAX_STREAM);
};
function streamFromPayload(payload, status, eventType, at) {
    const out = [];
    const tool = str(payload.tool_name);
    const preview = str(payload.tool_preview) || str(payload.text);
    const text = compact(str(payload.text) || preview);
    for (const tail of asTail(payload.output_tail)) {
        const line = tail.tool ? formatTool(tail.tool, tail.preview ?? '') : compact(tail.preview ?? '');
        if (line) {
            out.push({ at, isError: tail.isError, kind: tail.tool ? 'tool' : 'progress', text: line });
        }
    }
    if (tool) {
        out.push({ at, isError: !!payload.error, kind: 'tool', text: formatTool(tool, preview) });
    }
    if (eventType === 'subagent.progress' && text) {
        out.push({ at, isError: !!payload.error, kind: 'progress', text });
    }
    if (eventType === 'subagent.thinking' && text) {
        out.push({ at, kind: 'thinking', text });
    }
    const summary = compact(str(payload.summary) || str(payload.text));
    if (TERMINAL.has(status) && summary) {
        out.push({ at, isError: status === 'failed', kind: 'summary', text: summary });
    }
    return out;
}
function toProgress(payload, prev, eventType = '') {
    const at = Date.now();
    const status = asStatus(payload.status);
    const tool = str(payload.tool_name);
    const stream = streamFromPayload(payload, status, eventType, at).reduce(appendStream, prev?.stream ?? []);
    const filesRead = strList(payload.files_read);
    const filesWritten = strList(payload.files_written);
    return {
        id: prev?.id ?? idOf(payload),
        parentId: str(payload.parent_id) || prev?.parentId || null,
        goal: str(payload.goal) || prev?.goal || 'Subagent',
        sessionId: str(payload.child_session_id) || prev?.sessionId,
        model: str(payload.model) || prev?.model,
        status,
        taskCount: num(payload.task_count) ?? prev?.taskCount ?? 1,
        taskIndex: num(payload.task_index) ?? prev?.taskIndex ?? 0,
        startedAt: prev?.startedAt ?? at,
        updatedAt: at,
        durationSeconds: num(payload.duration_seconds) ?? prev?.durationSeconds,
        costUsd: num(payload.cost_usd) ?? prev?.costUsd,
        inputTokens: num(payload.input_tokens) ?? prev?.inputTokens,
        outputTokens: num(payload.output_tokens) ?? prev?.outputTokens,
        toolCount: num(payload.tool_count) ?? prev?.toolCount,
        filesRead: filesRead.length ? filesRead : (prev?.filesRead ?? []),
        filesWritten: filesWritten.length ? filesWritten : (prev?.filesWritten ?? []),
        stream,
        summary: str(payload.summary) || prev?.summary,
        currentTool: TERMINAL.has(status) ? undefined : tool || prev?.currentTool
    };
}
export function clearSessionSubagents(sid) {
    const map = $subagentsBySession.get();
    if (!(sid in map)) {
        return;
    }
    const { [sid]: _drop, ...rest } = map;
    $subagentsBySession.set(rest);
}
export function pruneDelegateFallbackSubagents(sid) {
    const map = $subagentsBySession.get();
    const list = map[sid];
    if (!list?.length) {
        return;
    }
    const next = list.filter(item => !item.id.startsWith('delegate-tool:'));
    if (next.length === list.length) {
        return;
    }
    $subagentsBySession.set({ ...map, [sid]: next });
}
export function upsertSubagent(sid, payload, createIfMissing = true, eventType) {
    const map = $subagentsBySession.get();
    const list = map[sid] ?? [];
    const id = idOf(payload);
    const idx = list.findIndex(item => item.id === id);
    if (idx < 0 && !createIfMissing) {
        return;
    }
    const prev = idx >= 0 ? list[idx] : undefined;
    if (prev && TERMINAL.has(prev.status)) {
        return;
    }
    const next = toProgress(payload, prev, eventType);
    const nextList = idx >= 0 ? list.map(item => (item.id === id ? next : item)) : [...list, next];
    $subagentsBySession.set({ ...map, [sid]: nextList });
}
export function buildSubagentTree(items) {
    const nodes = new Map();
    for (const item of items) {
        nodes.set(item.id, { ...item, children: [] });
    }
    const roots = [];
    for (const node of nodes.values()) {
        const parent = node.parentId ? nodes.get(node.parentId) : null;
        if (parent) {
            parent.children.push(node);
        }
        else {
            roots.push(node);
        }
    }
    const sort = (a, b) => a.startedAt - b.startedAt || a.taskIndex - b.taskIndex || a.goal.localeCompare(b.goal);
    const walk = (node) => node.children.sort(sort).forEach(walk);
    roots.sort(sort).forEach(walk);
    return roots;
}
export const activeSubagentCount = (items) => items.filter(item => item.status === 'queued' || item.status === 'running').length;
export const failedSubagentCount = (items) => items.filter(item => item.status === 'failed' || item.status === 'interrupted').length;
/** Flatten every session's subagents — the scope the Spawn-tree panel and the
 *  status-bar indicator must agree on. */
export const allSubagents = (bySession) => Object.values(bySession).flat();
