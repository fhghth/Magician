import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createCronJob, deleteCronJob, getCronJobRuns, getCronJobs, pauseCronJob, resumeCronJob, triggerCronJob, updateCronJob } from '@/hermes';
import { useI18n } from '@/i18n';
import { AlertTriangle } from '@/lib/icons';
import { asText } from '@/lib/text';
import { $cronFocusJobId, $cronJobs, setCronFocusJobId, setCronJobs, updateCronJobs } from '@/store/cron';
import { notify, notifyError } from '@/store/notifications';
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey';
import { Panel, PanelAction, PanelAddButton, PanelBlock, PanelBody, PanelDetail, PanelEmpty, PanelHeader, PanelList, PanelListRow, PanelMeta, PanelPill, PanelRowMenu, PanelSectionLabel } from '../overlays/panel';
import { jobState, jobTitle, STATE_DOT } from './job-state';
const DEFAULT_DELIVER = 'local';
const DELIVERY_VALUES = ['local', 'telegram', 'discord', 'slack', 'email'];
const SCHEDULE_OPTIONS = [
    { expr: '0 9 * * *', value: 'daily' },
    { expr: '0 9 * * 1-5', value: 'weekdays' },
    { expr: '0 9 * * 1', value: 'weekly' },
    { expr: '0 9 1 * *', value: 'monthly' },
    { expr: '0 * * * *', value: 'hourly' },
    { expr: '*/15 * * * *', value: 'every-15-minutes' },
    { value: 'custom' }
];
const STATE_TONE = {
    enabled: 'good',
    scheduled: 'good',
    running: 'good',
    paused: 'warn',
    disabled: 'muted',
    error: 'bad',
    completed: 'muted'
};
const truncate = (value, max = 80) => (value.length > max ? `${value.slice(0, max)}…` : value);
function jobName(job) {
    return asText(job.name).trim();
}
function jobPrompt(job) {
    return asText(job.prompt);
}
function jobScheduleDisplay(job) {
    return asText(job.schedule_display) || asText(job.schedule?.display) || asText(job.schedule?.expr) || '—';
}
function jobScheduleExpr(job) {
    return asText(job.schedule?.expr) || asText(job.schedule_display) || '';
}
function jobDeliver(job) {
    return asText(job.deliver) || DEFAULT_DELIVER;
}
function cronParts(expr) {
    const parts = expr.trim().replace(/\s+/g, ' ').split(' ');
    return parts.length === 5 ? parts : null;
}
function dayName(value, c) {
    return c.days[value] ?? c.dayFallback(value);
}
function formatCronTime(minute, hour) {
    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    if (!Number.isInteger(numericHour) || !Number.isInteger(numericMinute)) {
        return `${hour}:${minute}`;
    }
    return new Date(2000, 0, 1, numericHour, numericMinute).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    });
}
function isIntegerToken(value) {
    return /^\d+$/.test(value);
}
function scheduleOptionForExpr(expr) {
    const normalized = expr.trim().replace(/\s+/g, ' ');
    const exactMatch = SCHEDULE_OPTIONS.find(option => option.expr === normalized);
    if (exactMatch) {
        return exactMatch;
    }
    const parts = cronParts(normalized);
    if (!parts) {
        return SCHEDULE_OPTIONS[SCHEDULE_OPTIONS.length - 1];
    }
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && isIntegerToken(minute) && isIntegerToken(hour)) {
        return SCHEDULE_OPTIONS.find(option => option.value === 'daily') ?? SCHEDULE_OPTIONS[0];
    }
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5' && isIntegerToken(minute) && isIntegerToken(hour)) {
        return SCHEDULE_OPTIONS.find(option => option.value === 'weekdays') ?? SCHEDULE_OPTIONS[0];
    }
    if (dayOfMonth === '*' &&
        month === '*' &&
        isIntegerToken(dayOfWeek) &&
        isIntegerToken(minute) &&
        isIntegerToken(hour)) {
        return SCHEDULE_OPTIONS.find(option => option.value === 'weekly') ?? SCHEDULE_OPTIONS[0];
    }
    if (month === '*' &&
        dayOfWeek === '*' &&
        isIntegerToken(dayOfMonth) &&
        isIntegerToken(minute) &&
        isIntegerToken(hour)) {
        return SCHEDULE_OPTIONS.find(option => option.value === 'monthly') ?? SCHEDULE_OPTIONS[0];
    }
    if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*' && isIntegerToken(minute)) {
        return SCHEDULE_OPTIONS.find(option => option.value === 'hourly') ?? SCHEDULE_OPTIONS[0];
    }
    if (normalized === '*/15 * * * *') {
        return SCHEDULE_OPTIONS.find(option => option.value === 'every-15-minutes') ?? SCHEDULE_OPTIONS[0];
    }
    return SCHEDULE_OPTIONS[SCHEDULE_OPTIONS.length - 1];
}
function scheduleSummary(option, expr, c) {
    const parts = cronParts(expr);
    if (!parts) {
        return c.scheduleHints[option.value] ?? '';
    }
    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
    if (option.value === 'daily') {
        return c.everyDayAt(formatCronTime(minute, hour));
    }
    if (option.value === 'weekdays') {
        return c.weekdaysAt(formatCronTime(minute, hour));
    }
    if (option.value === 'weekly') {
        return c.everyDayOfWeekAt(dayName(dayOfWeek, c), formatCronTime(minute, hour));
    }
    if (option.value === 'monthly') {
        return c.monthlyOnDayAt(dayOfMonth, formatCronTime(minute, hour));
    }
    if (option.value === 'hourly') {
        return minute === '0' ? c.topOfHour : c.everyHourAt(minute.padStart(2, '0'));
    }
    return c.scheduleHints[option.value] ?? '';
}
function formatTime(iso) {
    if (!iso) {
        return '—';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.valueOf())) {
        return iso;
    }
    return date.toLocaleString();
}
function matchesQuery(job, q) {
    if (!q) {
        return true;
    }
    const needle = q.toLowerCase();
    return [jobTitle(job), jobPrompt(job), jobScheduleDisplay(job), jobScheduleExpr(job), jobDeliver(job)].some(value => value.toLowerCase().includes(needle));
}
export function CronView({ onClose, onOpenSession, setStatusbarItemGroup: _setStatusbarItemGroup }) {
    const { t } = useI18n();
    const c = t.cron;
    // Source of truth is the shared atom (also fed by the controller poll), so the
    // sidebar and this overlay never drift — a delete here clears the sidebar row
    // immediately. `loading` only gates the first paint before the atom is filled.
    const jobs = useStore($cronJobs);
    const [loading, setLoading] = useState(jobs.length === 0);
    const [query, setQuery] = useState('');
    const [busyJobId, setBusyJobId] = useState(null);
    // Master/detail: the job whose schedule + run history fill the right pane.
    const [selectedJobId, setSelectedJobId] = useState(null);
    // Set when a job is opened from the sidebar so we scroll it into view once the
    // row exists. Cleared after the scroll fires.
    const pendingScrollRef = useRef(null);
    const focusJobId = useStore($cronFocusJobId);
    const [editor, setEditor] = useState({ mode: 'closed' });
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const refresh = useCallback(async () => {
        try {
            setCronJobs(await getCronJobs());
        }
        catch (err) {
            notifyError(err, c.failedLoad);
        }
        finally {
            setLoading(false);
        }
    }, [c]);
    useRefreshHotkey(refresh);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    // Sidebar → "open this job": resolve the focus id (or name) to a job, select
    // it, queue a scroll, then clear the one-shot focus so re-opening cron
    // normally doesn't re-trigger it.
    useEffect(() => {
        if (!focusJobId) {
            return;
        }
        const match = jobs.find(job => job.id === focusJobId || jobName(job) === focusJobId);
        if (match) {
            setSelectedJobId(match.id);
            pendingScrollRef.current = match.id;
        }
        setCronFocusJobId(null);
    }, [focusJobId, jobs]);
    const visibleJobs = useMemo(() => jobs.filter(job => matchesQuery(job, query.trim())).sort((a, b) => jobTitle(a).localeCompare(jobTitle(b))), [jobs, query]);
    // Detail always reflects a concrete job: the explicitly selected one, else the
    // first visible row, so the right pane is never empty while jobs exist.
    const selectedJob = useMemo(() => visibleJobs.find(job => job.id === selectedJobId) ?? visibleJobs[0] ?? null, [visibleJobs, selectedJobId]);
    // Scroll a sidebar-opened job into view once its list row is mounted.
    useEffect(() => {
        const target = pendingScrollRef.current;
        if (!target || selectedJob?.id !== target) {
            return;
        }
        pendingScrollRef.current = null;
        requestAnimationFrame(() => {
            document.querySelector(`[data-panel-row="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'nearest' });
        });
    }, [selectedJob]);
    const totalCount = jobs.length;
    async function handlePauseResume(job) {
        setBusyJobId(job.id);
        try {
            const isPaused = jobState(job) === 'paused';
            const updated = isPaused ? await resumeCronJob(job.id) : await pauseCronJob(job.id);
            updateCronJobs(rows => rows.map(row => (row.id === job.id ? updated : row)));
            notify({
                kind: 'success',
                title: isPaused ? c.resumed : c.paused,
                message: truncate(jobTitle(job), 60)
            });
        }
        catch (err) {
            notifyError(err, c.failedUpdate);
        }
        finally {
            setBusyJobId(null);
        }
    }
    async function handleTrigger(job) {
        setBusyJobId(job.id);
        try {
            const updated = await triggerCronJob(job.id);
            updateCronJobs(rows => rows.map(row => (row.id === job.id ? updated : row)));
            notify({ kind: 'success', title: c.triggered, message: truncate(jobTitle(job), 60) });
        }
        catch (err) {
            notifyError(err, c.failedTrigger);
        }
        finally {
            setBusyJobId(null);
        }
    }
    async function handleConfirmDelete() {
        if (!pendingDelete) {
            return;
        }
        setDeleting(true);
        try {
            await deleteCronJob(pendingDelete.id);
            updateCronJobs(rows => rows.filter(row => row.id !== pendingDelete.id));
            notify({ kind: 'success', title: c.deleted, message: truncate(jobTitle(pendingDelete), 60) });
            setPendingDelete(null);
        }
        catch (err) {
            notifyError(err, c.failedDelete);
        }
        finally {
            setDeleting(false);
        }
    }
    async function handleEditorSave(values) {
        if (editor.mode === 'create') {
            const created = await createCronJob({
                prompt: values.prompt,
                schedule: values.schedule,
                name: values.name || undefined,
                deliver: values.deliver || DEFAULT_DELIVER
            });
            updateCronJobs(rows => [...rows, created]);
            notify({ kind: 'success', title: c.created, message: truncate(jobTitle(created), 60) });
        }
        else if (editor.mode === 'edit') {
            const updated = await updateCronJob(editor.job.id, {
                prompt: values.prompt,
                schedule: values.schedule,
                name: values.name,
                deliver: values.deliver
            });
            updateCronJobs(rows => rows.map(row => (row.id === updated.id ? updated : row)));
            notify({ kind: 'success', title: c.updated, message: truncate(jobTitle(updated), 60) });
        }
        setEditor({ mode: 'closed' });
    }
    return (_jsxs(Panel, { closeLabel: c.close, onClose: onClose, children: [loading && jobs.length === 0 ? (_jsx(PageLoader, { label: c.loading })) : totalCount === 0 ? (_jsx(PanelEmpty, { action: _jsx(Button, { onClick: () => setEditor({ mode: 'create' }), size: "sm", children: c.newCron }), description: c.emptyDescNew, icon: "watch", title: c.emptyTitleNew })) : (_jsxs(_Fragment, { children: [_jsx(PanelHeader, { subtitle: c.count(totalCount), title: c.title }), _jsxs(PanelBody, { children: [_jsxs(PanelList, { onSearchChange: setQuery, searchHints: jobs
                                    .map(jobTitle)
                                    .filter(Boolean)
                                    .slice(0, 5)
                                    .map(title => t.common.tryHint(title)), searchLabel: c.search, searchPlaceholder: c.search, searchValue: query, children: [visibleJobs.map(job => (_jsx(CronJobListRow, { active: selectedJob?.id === job.id, job: job, menu: _jsx(PanelRowMenu, { items: [
                                                { icon: 'edit', label: c.edit, onSelect: () => setEditor({ mode: 'edit', job }) },
                                                { icon: 'trash', label: t.common.delete, onSelect: () => setPendingDelete(job), tone: 'danger' }
                                            ] }), onSelect: () => setSelectedJobId(job.id) }, job.id))), visibleJobs.length === 0 && (_jsx("p", { className: "px-2 py-4 text-center text-xs text-muted-foreground", children: c.emptyTitleSearch })), _jsx(PanelAddButton, { label: c.newCron, onClick: () => setEditor({ mode: 'create' }) })] }), selectedJob ? (_jsx(CronJobDetail, { busy: busyJobId === selectedJob.id, c: c, job: selectedJob, onOpenSession: onOpenSession, onPauseResume: () => void handlePauseResume(selectedJob), onTrigger: () => void handleTrigger(selectedJob) })) : (_jsx(PanelEmpty, { description: c.emptyDescSearch, icon: "search" }))] })] })), _jsx(CronEditorDialog, { editor: editor, onClose: () => setEditor({ mode: 'closed' }), onSave: handleEditorSave }), _jsx(Dialog, { onOpenChange: open => !open && !deleting && setPendingDelete(null), open: pendingDelete !== null, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: c.deleteTitle }), _jsx(DialogDescription, { children: pendingDelete ? (_jsxs(_Fragment, { children: [c.deleteDescPrefix, _jsx("span", { className: "font-medium text-foreground", children: truncate(jobTitle(pendingDelete), 60) }), c.deleteDescSuffix] })) : null })] }), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: deleting, onClick: () => setPendingDelete(null), variant: "outline", children: t.common.cancel }), _jsx(Button, { disabled: deleting, onClick: () => void handleConfirmDelete(), variant: "destructive", children: deleting ? c.deleting : t.common.delete })] })] }) })] }));
}
function CronJobListRow({ active, job, menu, onSelect }) {
    const state = jobState(job);
    return (_jsx(PanelListRow, { active: active, dotClassName: STATE_DOT[state] ?? 'bg-muted-foreground', menu: menu, onSelect: onSelect, rowKey: job.id, title: jobTitle(job) }));
}
function CronJobDetail({ busy, c, job, onOpenSession, onPauseResume, onTrigger }) {
    const state = jobState(job);
    const isPaused = state === 'paused';
    const deliver = jobDeliver(job);
    const prompt = jobPrompt(job);
    return (_jsxs(PanelDetail, { children: [_jsxs("header", { className: "space-y-3", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { className: "flex min-w-0 flex-wrap items-center gap-2", children: [_jsx("h3", { className: "text-[0.95rem] font-semibold tracking-tight text-foreground", children: jobTitle(job) }), _jsx(PanelPill, { tone: STATE_TONE[state] ?? 'muted', children: c.states[state] ?? state })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-0.5", children: [_jsx(PanelAction, { disabled: busy, icon: isPaused ? 'play' : 'debug-pause', onClick: onPauseResume, children: isPaused ? c.resumeTitle : c.pauseTitle }), _jsx(PanelAction, { disabled: busy, icon: "zap", onClick: onTrigger, children: c.triggerNow })] })] }), _jsx(PanelMeta, { rows: [
                            { label: c.frequencyLabel, value: jobScheduleDisplay(job) },
                            { label: c.last.replace(/:$/, ''), value: formatTime(job.last_run_at) },
                            { label: c.next.replace(/:$/, ''), value: formatTime(job.next_run_at) },
                            { label: c.deliverLabel, value: c.deliveryLabels[deliver] ?? deliver }
                        ] }), job.last_error ? (_jsxs("div", { className: "flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-[0.7rem] text-destructive", children: [_jsx(AlertTriangle, { className: "mt-px size-3 shrink-0" }), _jsx("span", { className: "min-w-0 break-words", children: job.last_error })] })) : null] }), prompt ? (_jsxs("section", { className: "space-y-1.5", children: [_jsx(PanelSectionLabel, { children: c.promptLabel }), _jsx(PanelBlock, { children: prompt })] })) : null, _jsx(CronJobRuns, { c: c, jobId: job.id, onOpenSession: onOpenSession })] }));
}
function formatRunTime(seconds) {
    if (!seconds) {
        return '—';
    }
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString();
}
// Runs are produced by the background scheduler tick (no UI signal), so poll
// while the panel is open + on tab re-focus so a fired run shows up within a few
// seconds instead of waiting for a reload.
const RUNS_POLL_INTERVAL_MS = 8000;
function CronJobRuns({ c, jobId, onOpenSession }) {
    const [runs, setRuns] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => getCronJobRuns(jobId)
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
        }, RUNS_POLL_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                void load();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [jobId]);
    return (_jsxs("div", { children: [_jsxs(PanelSectionLabel, { className: "mb-1.5", children: [c.runHistory, runs && runs.length > 0 ? ` · ${runs.length}` : ''] }), runs === null ? (_jsx("div", { className: "flex items-center gap-1.5 py-1 text-xs text-muted-foreground", children: _jsx(Codicon, { name: "loading", size: "0.75rem", spinning: true }) })) : runs.length === 0 ? (_jsx("div", { className: "py-1 text-xs text-muted-foreground", children: c.noRuns })) : (_jsx("div", { className: "flex flex-col gap-px", children: runs.map(run => (_jsxs("button", { className: "row-hover flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", onClick: () => onOpenSession?.(run.id), type: "button", children: [_jsx("span", { className: "truncate text-foreground/85", children: run.title?.trim() || run.preview?.trim() || run.id }), _jsx("span", { className: "shrink-0 text-[0.62rem] text-muted-foreground/55 tabular-nums", children: formatRunTime(run.last_active || run.started_at) })] }, run.id))) }))] }));
}
function CronEditorDialog({ editor, onClose, onSave }) {
    const { t } = useI18n();
    const c = t.cron;
    const open = editor.mode !== 'closed';
    const isEdit = editor.mode === 'edit';
    const initial = isEdit ? editor.job : null;
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [schedule, setSchedule] = useState('');
    const [schedulePreset, setSchedulePreset] = useState('daily');
    const [deliver, setDeliver] = useState(DEFAULT_DELIVER);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        setName(initial ? jobName(initial) : '');
        setPrompt(initial ? jobPrompt(initial) : '');
        setSchedule(initial ? jobScheduleExpr(initial) : (SCHEDULE_OPTIONS[0].expr ?? ''));
        setSchedulePreset(initial ? scheduleOptionForExpr(jobScheduleExpr(initial)).value : 'daily');
        setDeliver(initial ? jobDeliver(initial) : DEFAULT_DELIVER);
        setError(null);
        setSaving(false);
    }, [initial, open]);
    const selectedScheduleOption = SCHEDULE_OPTIONS.find(candidate => candidate.value === schedulePreset) ?? SCHEDULE_OPTIONS[0];
    function handleSchedulePresetChange(nextPreset) {
        setSchedulePreset(nextPreset);
        setError(null);
        const option = SCHEDULE_OPTIONS.find(candidate => candidate.value === nextPreset);
        if (option?.expr) {
            setSchedule(option.expr);
        }
        else if (scheduleOptionForExpr(schedule).value !== 'custom') {
            setSchedule('');
        }
    }
    const scheduleHint = scheduleSummary(selectedScheduleOption, schedule, c);
    async function handleSubmit(event) {
        event.preventDefault();
        const trimmedPrompt = prompt.trim();
        const trimmedSchedule = schedule.trim();
        if (!trimmedPrompt || !trimmedSchedule) {
            setError(c.promptScheduleRequired);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave({
                deliver,
                name: name.trim(),
                prompt: trimmedPrompt,
                schedule: trimmedSchedule
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : c.failedSave);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Dialog, { onOpenChange: value => !value && !saving && onClose(), open: open, children: _jsxs(DialogContent, { className: "max-w-lg", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: isEdit ? c.editTitle : c.createTitle }), _jsx(DialogDescription, { children: isEdit ? c.editDesc : c.createDesc })] }), _jsxs("form", { className: "grid gap-4", onSubmit: handleSubmit, children: [_jsx(Field, { htmlFor: "cron-name", label: c.nameLabel, optional: true, optionalLabel: c.optional, children: _jsx(Input, { autoFocus: true, id: "cron-name", onChange: event => setName(event.target.value), placeholder: c.namePlaceholder, value: name }) }), _jsx(Field, { htmlFor: "cron-prompt", label: c.promptLabel, children: _jsx(Textarea, { className: "min-h-24 font-mono", id: "cron-prompt", onChange: event => setPrompt(event.target.value), placeholder: c.promptPlaceholder, value: prompt }) }), _jsxs("div", { className: "grid items-start gap-4 sm:grid-cols-2", children: [_jsx(Field, { htmlFor: "cron-frequency", label: c.frequencyLabel, children: _jsxs(Select, { onValueChange: handleSchedulePresetChange, value: schedulePreset, children: [_jsx(SelectTrigger, { className: "h-9 rounded-md", id: "cron-frequency", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: SCHEDULE_OPTIONS.map(option => (_jsx(SelectItem, { value: option.value, children: c.scheduleLabels[option.value] }, option.value))) })] }) }), _jsx(Field, { htmlFor: "cron-deliver", label: c.deliverLabel, children: _jsxs(Select, { onValueChange: setDeliver, value: deliver, children: [_jsx(SelectTrigger, { className: "h-9 rounded-md", id: "cron-deliver", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: DELIVERY_VALUES.map(value => (_jsx(SelectItem, { value: value, children: c.deliveryLabels[value] }, value))) })] }) })] }), schedulePreset === 'custom' ? (_jsxs(Field, { htmlFor: "cron-schedule", label: c.customScheduleLabel, children: [_jsx(Input, { className: "font-mono", id: "cron-schedule", onChange: event => setSchedule(event.target.value), placeholder: c.customPlaceholder, value: schedule }), _jsx(FieldHint, { children: c.customHint })] })) : (_jsx("div", { className: "rounded-md bg-(--ui-bg-quinary) px-3 py-2", children: _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs", children: [_jsx("span", { className: "font-medium text-foreground", children: scheduleHint }), _jsx("span", { className: "font-mono text-muted-foreground", children: schedule })] }) })), error && (_jsxs("div", { className: "flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive", children: [_jsx(AlertTriangle, { className: "mt-0.5 size-3.5 shrink-0" }), _jsx("span", { children: error })] })), _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: saving, onClick: onClose, type: "button", variant: "outline", children: t.common.cancel }), _jsx(Button, { disabled: saving, type: "submit", children: saving ? t.common.saving : isEdit ? c.saveChanges : c.createAction })] })] })] }) }));
}
function Field({ children, htmlFor, label, optional, optionalLabel }) {
    return (_jsxs("div", { className: "grid gap-1.5", children: [_jsxs("label", { className: "flex items-baseline gap-2 text-xs font-medium text-foreground", htmlFor: htmlFor, children: [label, optional && _jsx("span", { className: "text-[0.65rem] font-normal text-muted-foreground", children: optionalLabel })] }), children] }));
}
function FieldHint({ children }) {
    return _jsx("p", { className: "text-[0.66rem] leading-4 text-muted-foreground", children: children });
}
