import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import { Codicon } from '@/components/ui/codicon';
import { DisclosureCaret } from '@/components/ui/disclosure-caret';
import { GlyphSpinner } from '@/components/ui/glyph-spinner';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { Tip } from '@/components/ui/tooltip';
import { getCronJobRuns } from '@/hermes';
import { useI18n } from '@/i18n';
import { fmtDayTime, relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { $selectedStoredSessionId } from '@/store/session';
import { jobState, jobTitle, STATE_DOT } from '../../cron/job-state';
import { SidebarPanelLabel } from '../../shell/sidebar-label';
import { SidebarLoadMoreRow } from './load-more-row';
const INACTIVE_STATES = new Set(['completed', 'disabled', 'error', 'paused']);
// Recent runs shown in the inline quick-peek — enough to glance at history
// without turning the sidebar into the full Cron page.
const PEEK_RUN_LIMIT = 5;
// Runs are written by the background scheduler tick (no UI signal), so poll the
// open peek so a freshly-fired run shows up within a few seconds.
const PEEK_POLL_INTERVAL_MS = 8000;
// Keep the section compact: show a few jobs up front, reveal more in larger
// steps on demand (mirrors the messaging sections in the sidebar).
const INITIAL_VISIBLE_JOBS = 3;
const LOAD_MORE_STEP = 10;
function nextRunMs(job) {
    if (!job.next_run_at) {
        return null;
    }
    const ms = Date.parse(job.next_run_at);
    return Number.isNaN(ms) ? null : ms;
}
// Runs all belong to the same job, so the run name just repeats the job name —
// the timestamp is what tells them apart. Compact (no year, no seconds) for the
// narrow sidebar.
function formatRunTime(seconds) {
    if (!seconds) {
        return '—';
    }
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.valueOf()) ? '—' : fmtDayTime.format(date);
}
export function SidebarCronJobsSection({ jobs, label, max = 50, onManageJob, onOpenRun, onTriggerJob, onToggle, open }) {
    const [nowMs, setNowMs] = useState(() => Date.now());
    // Single-open inline peek so the section stays scannable.
    const [peekJobId, setPeekJobId] = useState(null);
    // Rows revealed so far; starts compact, grows in steps via "load more".
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_JOBS);
    // One clock for the whole section (rows are pure) so the countdowns tick
    // without re-rendering the rest of the sidebar. Only runs while expanded.
    useEffect(() => {
        if (!open) {
            return;
        }
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [open]);
    // Upcoming first (soonest next run), jobs with no next run sink to the bottom,
    // then alphabetical for stability.
    const sorted = useMemo(() => {
        return [...jobs].sort((a, b) => {
            const an = nextRunMs(a);
            const bn = nextRunMs(b);
            if (an !== null && bn !== null && an !== bn) {
                return an - bn;
            }
            if (an === null && bn !== null) {
                return 1;
            }
            if (an !== null && bn === null) {
                return -1;
            }
            return jobTitle(a).localeCompare(jobTitle(b));
        });
    }, [jobs]);
    const cap = Math.min(visibleCount, max);
    const shown = sorted.slice(0, cap);
    const hiddenCount = Math.min(sorted.length, max) - shown.length;
    // When capped, signal "50+" rather than implying the list is complete.
    const countLabel = jobs.length > max ? `${max}+` : String(jobs.length);
    return (_jsxs(SidebarGroup, { className: "shrink-0 p-0 pb-1", children: [_jsx("div", { className: "group/section flex shrink-0 items-center justify-between pb-1 pt-1.5", children: _jsxs("button", { className: "group/section-label flex w-fit items-center gap-1 bg-transparent text-left leading-none", onClick: onToggle, type: "button", children: [_jsx(SidebarPanelLabel, { children: label }), _jsx("span", { className: "text-[0.6875rem] font-medium text-(--ui-text-quaternary)", children: countLabel }), _jsx(DisclosureCaret, { className: "text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100", open: open })] }) }), open && (_jsxs(SidebarGroupContent, { className: "flex max-h-72 flex-col gap-px overflow-x-hidden overflow-y-auto overscroll-contain pb-1.75 compact:max-h-none compact:overflow-visible", children: [shown.map(job => (_jsx(CronJobSidebarRow, { expanded: peekJobId === job.id, job: job, nowMs: nowMs, onManage: () => onManageJob(job.id), onOpenRun: onOpenRun, onTogglePeek: () => setPeekJobId(prev => (prev === job.id ? null : job.id)), onTrigger: () => onTriggerJob(job.id) }, job.id))), hiddenCount > 0 && (_jsx(SidebarLoadMoreRow, { onClick: () => setVisibleCount(count => count + LOAD_MORE_STEP), step: Math.min(LOAD_MORE_STEP, hiddenCount) }))] }))] }));
}
function CronJobSidebarRow({ expanded, job, nowMs, onManage, onOpenRun, onTogglePeek, onTrigger }) {
    const { t } = useI18n();
    const c = t.cron;
    const state = jobState(job);
    const next = nextRunMs(job);
    const label = jobTitle(job);
    const meta = INACTIVE_STATES.has(state) ? (c.states[state] ?? state) : next !== null ? relativeTime(next, nowMs) : '—';
    return (_jsxs("div", { children: [_jsxs("div", { className: "group/cron relative grid min-h-[1.625rem] grid-cols-[minmax(0,1fr)_auto] items-center rounded-md hover:bg-(--chrome-action-hover)", children: [_jsxs("button", { "aria-expanded": expanded, "aria-label": expanded ? c.hideRuns : c.showRuns, className: "flex min-w-0 items-center gap-1.5 bg-transparent py-0.5 pl-2 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", onClick: onTogglePeek, title: label, type: "button", children: [_jsx("span", { className: "grid w-3.5 shrink-0 place-items-center", children: _jsx("span", { "aria-hidden": "true", className: cn('size-1 rounded-full', STATE_DOT[state] ?? 'bg-(--ui-text-quaternary)', state === 'running' && 'size-1.5 animate-pulse') }) }), _jsx("span", { className: "min-w-0 truncate text-[0.8125rem] text-(--ui-text-secondary) group-hover/cron:text-foreground", children: label }), _jsx(DisclosureCaret, { className: cn('shrink-0 text-(--ui-text-tertiary) transition', expanded ? 'opacity-100' : 'opacity-0 group-hover/cron:opacity-100'), open: expanded })] }), _jsxs("div", { className: "flex items-center gap-0.5 justify-self-end pr-1", children: [_jsx("span", { className: "text-[0.6875rem] text-(--ui-text-tertiary) tabular-nums group-hover/cron:hidden", children: meta }), _jsxs("div", { className: "hidden items-center gap-0.5 group-hover/cron:flex", children: [_jsx(Tip, { label: c.triggerNow, children: _jsx("button", { "aria-label": c.triggerNow, className: "grid size-5 place-items-center rounded-sm text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground", onClick: onTrigger, type: "button", children: _jsx(Codicon, { name: "zap", size: "0.75rem" }) }) }), _jsx(Tip, { label: c.manage, children: _jsx("button", { "aria-label": c.manage, className: "grid size-5 place-items-center rounded-sm text-(--ui-text-tertiary) hover:bg-(--ui-control-hover-background) hover:text-foreground", onClick: onManage, type: "button", children: _jsx(Codicon, { name: "watch", size: "0.75rem" }) }) })] })] })] }), expanded && _jsx(CronJobSidebarRuns, { jobId: job.id, onOpenRun: onOpenRun })] }));
}
function CronJobSidebarRuns({ jobId, onOpenRun }) {
    const { t } = useI18n();
    const c = t.cron;
    const selectedSessionId = useStore($selectedStoredSessionId);
    const [runs, setRuns] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => getCronJobRuns(jobId, PEEK_RUN_LIMIT)
            .then(result => {
            if (!cancelled) {
                setRuns(result);
            }
        })
            .catch(() => {
            if (!cancelled) {
                setRuns(prev => prev ?? []);
            }
        });
        void load();
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void load();
            }
        }, PEEK_POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [jobId]);
    return (_jsx("div", { className: "mb-1 ml-[1.375rem] flex flex-col gap-px", children: runs === null ? (_jsx("div", { className: "flex items-center gap-1.5 py-1 pl-1 text-[0.6875rem] text-(--ui-text-tertiary)", children: _jsx(GlyphSpinner, { ariaLabel: c.loading, className: "text-[0.75rem]" }) })) : runs.length === 0 ? (_jsx("div", { className: "py-1 pl-1 text-[0.6875rem] text-(--ui-text-tertiary)", children: c.noRuns })) : (_jsx(_Fragment, { children: runs.map(run => (_jsx("button", { className: cn('truncate rounded-md px-1.5 py-0.5 text-left text-[0.6875rem] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', run.id === selectedSessionId
                    ? 'bg-(--ui-row-active-background) text-foreground'
                    : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'), onClick: () => onOpenRun(run.id), type: "button", children: formatRunTime(run.last_active || run.started_at) }, run.id))) })) }));
}
