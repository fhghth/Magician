import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import { useElapsedSeconds } from '@/components/chat/activity-timer';
import { ActivityTimerText } from '@/components/chat/activity-timer-text';
import { Codicon } from '@/components/ui/codicon';
import { FadeText } from '@/components/ui/fade-text';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { useI18n } from '@/i18n';
import { compactNumber } from '@/lib/format';
import { AlertCircle, CheckCircle2 } from '@/lib/icons';
import { useEnterAnimation } from '@/lib/use-enter-animation';
import { cn } from '@/lib/utils';
import { $subagentsBySession, allSubagents, buildSubagentTree } from '@/store/subagents';
import { Panel, PanelEmpty, PanelHeader } from '../overlays/panel';
// Mirrors statusGlyph() in tool-fallback.tsx so subagent rows speak the
// same visual vocabulary as the chat tool blocks.
function statusGlyph(status, a) {
    if (status === 'running' || status === 'queued') {
        return (_jsx(GlyphSpinner, { ariaLabel: a.running, className: "size-3.5 shrink-0 text-[0.95rem] text-muted-foreground/80", spinner: "breathe" }));
    }
    if (status === 'failed' || status === 'interrupted') {
        return _jsx(AlertCircle, { "aria-label": a.failed, className: "size-3.5 shrink-0 text-destructive" });
    }
    return _jsx(CheckCircle2, { "aria-label": a.done, className: "size-3.5 shrink-0 text-emerald-600/85 dark:text-emerald-400/85" });
}
const STREAM_TONE = {
    progress: 'text-muted-foreground/75',
    summary: 'text-foreground/85',
    thinking: 'text-muted-foreground/80',
    tool: 'text-foreground/85'
};
function streamGlyph(entry) {
    if (entry.isError) {
        return _jsx(AlertCircle, { "aria-hidden": true, className: "mt-0.5 size-3 shrink-0 text-destructive" });
    }
    if (entry.kind === 'tool') {
        return _jsx("span", { "aria-hidden": true, className: "mt-0.5 size-1.5 shrink-0 rounded-full bg-foreground/55" });
    }
    if (entry.kind === 'summary') {
        return _jsx(CheckCircle2, { "aria-hidden": true, className: "mt-0.5 size-3 shrink-0 text-emerald-600/85 dark:text-emerald-400/85" });
    }
    if (entry.kind === 'thinking') {
        return (_jsx("span", { "aria-hidden": true, className: "font-mono text-[0.7rem] leading-none text-muted-foreground/70", children: "\u2026" }));
    }
    return _jsx("span", { "aria-hidden": true, className: "mt-0.5 size-1 shrink-0 rounded-full bg-muted-foreground/55" });
}
export function AgentsView({ onClose }) {
    const { t } = useI18n();
    const subagentsBySession = useStore($subagentsBySession);
    // Aggregate every session, matching the status-bar indicator — a subagent
    // running in a background session must still be visible here, or the two
    // desync ("Agents N running" vs an empty tree).
    const tree = useMemo(() => buildSubagentTree(allSubagents(subagentsBySession)), [subagentsBySession]);
    return (_jsx(Panel, { closeLabel: t.agents.close, onClose: onClose, children: tree.length === 0 ? (_jsx(PanelEmpty, { description: t.agents.emptyDesc, icon: "hubot", title: t.agents.emptyTitle })) : (_jsxs(_Fragment, { children: [_jsx(PanelHeader, { subtitle: t.agents.subtitle, title: t.agents.title }), _jsx(SubagentTree, { tree: tree })] })) }));
}
const fmtDuration = (seconds, a) => {
    if (!seconds || seconds <= 0) {
        return '';
    }
    if (seconds < 60) {
        return a.durationSeconds(seconds.toFixed(1));
    }
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return a.durationMinutes(m, s);
};
const fmtTokens = (value, a) => value ? a.tokens(compactNumber(value)) : '';
// Distinct contract from coarseElapsed: rounds to the second (this ticks live),
// and hours are unbounded ("25h", never "1d"). Kept local on purpose.
const fmtAge = (updatedAt, nowMs, a) => {
    const s = Math.max(0, Math.round((nowMs - updatedAt) / 1000));
    if (s < 2) {
        return a.ageNow;
    }
    if (s < 60) {
        return a.ageSeconds(s);
    }
    const m = Math.floor(s / 60);
    return m < 60 ? a.ageMinutes(m) : a.ageHours(Math.floor(m / 60));
};
const flatten = (nodes) => nodes.flatMap(node => [node, ...flatten(node.children)]);
function groupDelegations(roots) {
    const groups = [];
    let n = 0;
    for (const node of roots) {
        const prev = groups.at(-1);
        const prevTail = prev?.nodes.at(-1);
        const closeInTime = prevTail ? Math.abs(node.startedAt - prevTail.startedAt) <= 5_000 : false;
        const sameShape = prev && node.taskCount > 1 && prev.taskCount === node.taskCount;
        const uniqueStep = prev ? !prev.nodes.some(item => item.taskIndex === node.taskIndex) : false;
        if (prev && sameShape && closeInTime && uniqueStep) {
            prev.nodes.push(node);
            continue;
        }
        if (node.taskCount > 1) {
            n += 1;
            groups.push({ id: `delegation-${n}`, delegationIndex: n, nodes: [node], taskCount: node.taskCount });
            continue;
        }
        groups.push({ id: node.id, delegationIndex: 0, nodes: [node], taskCount: node.taskCount });
    }
    return groups;
}
function SubagentTree({ tree }) {
    const { t } = useI18n();
    const flat = useMemo(() => flatten(tree), [tree]);
    const groups = useMemo(() => groupDelegations(tree), [tree]);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const active = flat.filter(n => n.status === 'running' || n.status === 'queued').length;
    const failed = flat.filter(n => n.status === 'failed' || n.status === 'interrupted').length;
    const tools = flat.reduce((sum, n) => sum + (n.toolCount ?? 0), 0);
    const files = flat.reduce((sum, n) => sum + n.filesRead.length + n.filesWritten.length, 0);
    const tokens = flat.reduce((sum, n) => sum + (n.inputTokens ?? 0) + (n.outputTokens ?? 0), 0);
    const cost = flat.reduce((sum, n) => sum + (n.costUsd ?? 0), 0);
    useEffect(() => {
        if (active <= 0 || typeof window === 'undefined') {
            return;
        }
        const id = window.setInterval(() => setNowMs(Date.now()), 500);
        return () => window.clearInterval(id);
    }, [active]);
    if (tree.length === 0) {
        return (_jsxs("div", { className: "grid place-items-center gap-3 py-12 text-center", children: [_jsx(Codicon, { className: "text-muted-foreground/60", name: "hubot", size: "1.5rem" }), _jsx("p", { className: "text-sm font-medium text-foreground/90", children: t.agents.emptyTitle }), _jsx("p", { className: "max-w-md text-xs leading-relaxed text-muted-foreground/75", children: t.agents.emptyDesc })] }));
    }
    const summary = [
        t.agents.agentsCount(flat.length),
        active > 0 ? t.agents.activeCount(active) : '',
        failed > 0 ? t.agents.failedCount(failed) : '',
        tools > 0 ? t.agents.toolsCount(tools) : '',
        files > 0 ? t.agents.filesCount(files) : '',
        tokens > 0 ? fmtTokens(tokens, t.agents) : '',
        cost > 0 ? `$${cost.toFixed(2)}` : ''
    ].filter(Boolean);
    return (_jsxs("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden", children: [_jsx("p", { className: "shrink-0 text-[0.7rem] text-muted-foreground/70", children: summary.join(' · ') }), _jsx("div", { className: "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1", children: _jsx("div", { className: "flex min-w-0 flex-col gap-6", children: groups.map(group => (_jsx(DelegationGroup, { group: group, nowMs: nowMs }, group.id))) }) })] }));
}
function DelegationGroup({ group, nowMs }) {
    const { t } = useI18n();
    if (group.nodes.length === 1 && group.taskCount <= 1) {
        return _jsx(SubagentRow, { node: group.nodes[0], nowMs: nowMs });
    }
    const activeWorkers = group.nodes.filter(n => n.status === 'running' || n.status === 'queued').length;
    return (_jsxs("section", { className: "grid min-w-0 gap-3", children: [_jsxs("p", { className: "text-[0.66rem] font-medium uppercase tracking-wider text-muted-foreground/70", children: [group.delegationIndex > 0 ? t.agents.delegation(group.delegationIndex) : '', ' ', _jsx("span", { className: "text-muted-foreground/50", children: "\u00B7" }), " ", t.agents.workers(group.nodes.length), activeWorkers > 0 ? _jsxs("span", { className: "text-primary/85", children: [" \u00B7 ", t.agents.workersActive(activeWorkers)] }) : null] }), _jsx("div", { className: "grid min-w-0 gap-4", children: group.nodes.map(node => (_jsx(SubagentRow, { node: node, nowMs: nowMs }, node.id))) })] }));
}
function StreamLine({ active, entry, parentRunning, rowKey }) {
    const { t } = useI18n();
    const enterRef = useEnterAnimation(parentRunning, `subagent-stream:${rowKey}`);
    const isMono = entry.kind === 'tool';
    const tone = entry.isError ? 'text-destructive' : STREAM_TONE[entry.kind];
    return (_jsxs("div", { className: "flex min-w-0 items-baseline gap-2 text-[0.72rem] leading-relaxed", ref: enterRef, children: [_jsx("span", { className: "flex h-[0.95rem] shrink-0 items-center", children: streamGlyph(entry) }), _jsxs("span", { className: cn('min-w-0 flex-1 wrap-anywhere', tone, isMono && 'font-mono text-[0.69rem]'), children: [entry.text, active ? (_jsx(GlyphSpinner, { ariaLabel: t.agents.streaming, className: "ml-1 inline-block size-2.5 align-middle text-muted-foreground/70", spinner: "breathe" })) : null] })] }));
}
function SubagentRow({ node, depth = 0, nowMs }) {
    const { t } = useI18n();
    const running = node.status === 'running' || node.status === 'queued';
    const elapsed = useElapsedSeconds(running, `subagent:${node.id}`);
    const durationSeconds = typeof node.durationSeconds === 'number' ? Math.max(0, Math.round(node.durationSeconds)) : elapsed;
    const [open, setOpen] = useState(() => running || depth < 2);
    const enterRef = useEnterAnimation(true, `subagent-row:${node.id}`);
    useEffect(() => {
        if (running) {
            setOpen(true);
        }
    }, [running]);
    const visibleRows = open ? node.stream.slice(-10) : node.stream.slice(-2);
    const fileLines = [...node.filesWritten.map(p => `+ ${p}`), ...node.filesRead.map(p => `· ${p}`)];
    const subtitle = [
        node.model,
        fmtDuration(durationSeconds, t.agents),
        node.toolCount ? t.agents.toolsCount(node.toolCount) : '',
        fmtTokens((node.inputTokens ?? 0) + (node.outputTokens ?? 0), t.agents),
        t.agents.updatedAgo(fmtAge(node.updatedAt, nowMs, t.agents))
    ].filter(Boolean);
    return (_jsxs("div", { className: cn('grid min-w-0 max-w-full gap-2', depth > 0 && 'pl-4'), "data-slot": "tool-block", ref: enterRef, children: [_jsxs("button", { "aria-expanded": open, className: "group flex w-full min-w-0 items-start gap-2.5 text-left", onClick: () => setOpen(v => !v), type: "button", children: [_jsx("span", { className: "mt-0.5 flex h-[1.1rem] shrink-0 items-center", children: statusGlyph(node.status, t.agents) }), _jsxs("span", { className: "flex min-w-0 flex-1 flex-col gap-0.5", children: [_jsx("span", { className: cn('wrap-anywhere text-[0.82rem] font-medium leading-[1.1rem] text-foreground/90 transition-colors group-hover:text-foreground', running && 'shimmer text-foreground/65'), children: node.goal }), subtitle.length > 0 ? (_jsx(FadeText, { className: "text-[0.66rem] leading-[1.05rem] text-muted-foreground/65", children: subtitle.join(' · ') })) : null] }), running ? _jsx(ActivityTimerText, { className: "mt-1 shrink-0 text-[0.6rem]", seconds: durationSeconds }) : null] }), visibleRows.length > 0 ? (_jsx("div", { className: "grid min-w-0 gap-1 pl-6", "data-selectable-text": "true", children: visibleRows.map((entry, i) => (_jsx(StreamLine, { active: running && i === visibleRows.length - 1, entry: entry, parentRunning: running, rowKey: `${node.id}:${entry.kind}:${entry.at}` }, `${entry.kind}:${entry.at}:${i}`))) })) : null, open && fileLines.length > 0 ? (_jsxs("div", { className: "grid min-w-0 gap-0.5 pl-6", "data-selectable-text": "true", children: [_jsx("p", { className: "text-[0.58rem] font-medium tracking-wider text-muted-foreground/60 uppercase", children: t.agents.files }), fileLines.slice(0, 8).map(line => (_jsx("p", { className: "wrap-break-word font-mono text-[0.67rem] leading-relaxed text-muted-foreground/80", children: line }, line))), fileLines.length > 8 ? (_jsx("p", { className: "font-mono text-[0.67rem] leading-relaxed text-muted-foreground/65", children: t.agents.moreFiles(fileLines.length - 8) })) : null] })) : null, node.children.length > 0 ? (_jsx("div", { className: "grid min-w-0 gap-3 pl-6", children: node.children.map(child => (_jsx(SubagentRow, { depth: depth + 1, node: child, nowMs: nowMs }, child.id))) })) : null] }));
}
