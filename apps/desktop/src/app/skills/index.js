import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveSkillConfirmDialog } from '@/app/learning/archive-skill-confirm-dialog';
import { CodeEditor } from '@/components/chat/code-editor';
import { PageLoader } from '@/components/page-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CountSkeleton } from '@/components/ui/skeleton';
import { editLearningNode, getLearningNode, getSkills, getToolsets, getUsageAnalytics, toggleSkill, toggleToolset } from '@/hermes';
import { useI18n } from '@/i18n';
import { isDesktopToolsetVisible } from '@/lib/desktop-toolsets';
import { compactNumber } from '@/lib/format';
import { queryClient, writeCache } from '@/lib/query-client';
import { normalize } from '@/lib/text';
import { $gateway } from '@/store/gateway';
import { notify, notifyError } from '@/store/notifications';
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile';
import { useOnProfileSwitch } from '../hooks/use-on-profile-switch';
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey';
import { useRouteEnumParam } from '../hooks/use-route-enum-param';
import { CapRow, DetailColumn, DetailPane, ListColumn, ListStrip, ListStripButton, ListStripMenu, MasterDetail, ToolChip } from '../master-detail';
import { PanelEmpty, PanelPill } from '../overlays/panel';
import { PageSearchShell } from '../page-search-shell';
import { ComputerUsePanel } from '../settings/computer-use-panel';
import { asText, includesQuery, prettyName, toolNames, toolsetDisplayLabel } from '../settings/helpers';
import { ToolsetConfigPanel } from '../settings/toolset-config-panel';
import { SkillsHub } from './hub';
import { McpTab } from './mcp-tab';
import { $skillsSortDesc, $toolsetsSortDesc } from './store';
const SKILLS_MODES = ['skills', 'toolsets', 'mcp', 'hub'];
// Skills + toolsets live in the RQ cache so switching tabs/pages paints the
// cached lists instantly (no reload flash) and mount only fires a deduped
// background refetch. A profile swap globally invalidates (see store/profile),
// so these plain keys refetch against the new backend automatically.
const SKILLS_QUERY_KEY = ['skills-list'];
const TOOLSETS_QUERY_KEY = ['toolsets-list'];
// Optimistic write-through: toggles/bulk/archive repaint instantly; the next
// background refetch reconciles with the backend.
const setSkills = writeCache(SKILLS_QUERY_KEY);
const setToolsets = writeCache(TOOLSETS_QUERY_KEY);
// Per-tool call counts come from a 365-day message scan — heavy, and purely
// cosmetic (Toolsets usage badges). Cache the result module-wide with a TTL so
// bouncing between tabs/pages doesn't re-run the scan every time. Keyed by
// profile: analytics are profile-scoped, so a switch must not show the previous
// profile's counts. `useRefreshHotkey` still forces a fresh pull.
const TOOL_CALLS_TTL_MS = 10 * 60 * 1000;
const toolCallsCache = new Map();
async function loadToolCalls(force = false) {
    const key = normalizeProfileKey($activeGatewayProfile.get());
    const cached = toolCallsCache.get(key);
    if (!force && cached && Date.now() - cached.at < TOOL_CALLS_TTL_MS) {
        return cached.value;
    }
    const analytics = await getUsageAnalytics(365);
    const value = Object.fromEntries((analytics.tools ?? []).map(e => [e.tool, e.count]));
    // Only cache if the active profile hasn't changed during the request — else a
    // switch mid-flight would file this result under the wrong profile's key.
    if (normalizeProfileKey($activeGatewayProfile.get()) === key) {
        toolCallsCache.set(key, { at: Date.now(), value });
    }
    return value;
}
const usageOf = (skill) => (typeof skill.usage === 'number' ? skill.usage : 0);
const categoryFor = (skill) => asText(skill.category) || 'general';
// Row subtitle: category, with non-default origins badged.
function skillSubtitle(skill) {
    const category = prettyName(categoryFor(skill));
    const provenance = skill.provenance;
    return (_jsxs(_Fragment, { children: [_jsx("span", { className: "truncate", children: category }), provenance === 'agent' && (_jsx(Badge, { className: "shrink-0 normal-case", variant: "default", children: "learned" })), provenance === 'hub' && (_jsx(Badge, { className: "shrink-0 normal-case", variant: "muted", children: "hub" }))] }));
}
function filteredSkills(skills, query, desc) {
    const q = normalize(query);
    const sign = desc ? 1 : -1;
    return skills
        .filter(skill => !q || includesQuery(skill.name, q) || includesQuery(skill.description, q) || includesQuery(skill.category, q))
        .sort((a, b) => sign * (usageOf(b) - usageOf(a)) || asText(a.name).localeCompare(asText(b.name)));
}
const toolsetCalls = (toolset, toolCalls) => toolNames(toolset).reduce((sum, name) => sum + (toolCalls[name] ?? 0), 0);
function filteredToolsets(toolsets, query, toolCalls, desc) {
    const q = normalize(query);
    const sign = desc ? 1 : -1;
    return toolsets
        .filter(toolset => {
        if (!isDesktopToolsetVisible(toolset.name)) {
            return false;
        }
        if (!q) {
            return true;
        }
        return (includesQuery(toolset.name, q) ||
            includesQuery(toolsetDisplayLabel(toolset), q) ||
            includesQuery(toolset.description, q) ||
            toolNames(toolset).some(name => includesQuery(name, q)));
    })
        .sort((a, b) => sign * (toolsetCalls(b, toolCalls) - toolsetCalls(a, toolCalls)) ||
        toolsetDisplayLabel(a).localeCompare(toolsetDisplayLabel(b)));
}
const visibleToolsetCount = (toolsets) => toolsets.filter(ts => isDesktopToolsetVisible(ts.name)).length;
export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }) {
    const { t } = useI18n();
    const gateway = useStore($gateway);
    const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills');
    const [query, setQuery] = useState('');
    const { data: skills, isError: skillsFailed, error: skillsError } = useQuery({
        queryKey: SKILLS_QUERY_KEY,
        queryFn: getSkills,
        staleTime: 0
    });
    const { data: toolsets, isError: toolsetsFailed } = useQuery({
        queryKey: TOOLSETS_QUERY_KEY,
        queryFn: getToolsets,
        staleTime: 0
    });
    // tool name -> call count over the analytics window. null = still loading
    // (badges show skeletons); {} = loaded empty / unavailable backend.
    const [toolCalls, setToolCalls] = useState(null);
    // Bumped on profile switch so a slow analytics load from profile A can't set
    // toolCalls after the user moved to B.
    const toolCallsEpoch = useRef(0);
    const skillsSortDesc = useStore($skillsSortDesc);
    const toolsetsSortDesc = useStore($toolsetsSortDesc);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState(null);
    const [selectedToolset, setSelectedToolset] = useState(null);
    const refreshCapabilities = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: SKILLS_QUERY_KEY }),
            queryClient.invalidateQueries({ queryKey: TOOLSETS_QUERY_KEY })
        ]);
        // An explicit refresh is the one time we bypass the analytics TTL — but
        // only if the badges are already on screen; otherwise let the lazy load
        // pick it up when Toolsets is first shown. Guard the async set against a
        // profile switch landing before it resolves.
        if (toolCallsCache.size > 0) {
            const epoch = toolCallsEpoch.current;
            loadToolCalls(true)
                .then(value => toolCallsEpoch.current === epoch && setToolCalls(value))
                .catch(() => toolCallsEpoch.current === epoch && setToolCalls({}));
        }
    }, []);
    const refreshToolsets = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: TOOLSETS_QUERY_KEY });
    }, []);
    useRefreshHotkey(refreshCapabilities);
    // Per-tool call counts feed ONLY the Toolsets tab's usage badges/sort, and
    // the query behind them is a 365-day message scan — heavy. Fetch it lazily
    // the first time Toolsets is shown, never on Skills or MCP, so it can't
    // starve the MCP tab's config load. Absent → toolsets sort A–Z until it lands.
    useEffect(() => {
        if (mode !== 'toolsets' || toolCalls !== null) {
            return;
        }
        let cancelled = false;
        // Guard the setter by epoch too: when toolCalls is already null at switch
        // time, setToolCalls(null) is a no-op so this effect never re-runs to flip
        // `cancelled` — the epoch check catches that gap.
        const epoch = toolCallsEpoch.current;
        const live = () => !cancelled && toolCallsEpoch.current === epoch;
        loadToolCalls()
            .then(value => live() && setToolCalls(value))
            .catch(() => live() && setToolCalls({}));
        return () => void (cancelled = true);
    }, [mode, toolCalls]);
    // On a profile switch the analytics cache is profile-keyed, but our local
    // toolCalls state isn't — leaving it non-null would keep the lazy effect from
    // ever re-running, so badges/sort would show the previous profile's counts.
    // Reset to null so the next Toolsets view reloads for the active profile.
    useOnProfileSwitch(() => {
        toolCallsEpoch.current += 1;
        setToolCalls(null);
    });
    const visibleSkills = useMemo(() => (skills ? filteredSkills(skills, query, skillsSortDesc) : []), [query, skills, skillsSortDesc]);
    const visibleToolsets = useMemo(() => (toolsets ? filteredToolsets(toolsets, query, toolCalls ?? {}, toolsetsSortDesc) : []), [query, toolCalls, toolsets, toolsetsSortDesc]);
    // Bulk actions ("All" master switch, "Disable unused") and the master-switch
    // state target the WHOLE tab, never the search-filtered view — a tab-wide
    // control that silently scoped to the current query would be a lie.
    const bulkSkills = skills ?? [];
    const bulkToolsets = useMemo(() => (toolsets ?? []).filter(ts => isDesktopToolsetVisible(ts.name)), [toolsets]);
    // Rotating placeholder nudges from the user's own data — teach that search
    // understands categories and tool names, not just titles.
    const searchHints = useMemo(() => {
        if (mode === 'skills' && skills?.length) {
            const counts = new Map();
            for (const skill of skills) {
                const key = categoryFor(skill);
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            return [...counts.entries()]
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([category]) => t.common.tryHint(category.toLowerCase()));
        }
        if (mode === 'toolsets' && toolsets?.length) {
            return toolsets
                .filter(ts => isDesktopToolsetVisible(ts.name) && toolNames(ts).length > 0)
                .slice(0, 5)
                .map(ts => t.common.tryHint(toolNames(ts)[0]));
        }
        return undefined;
    }, [mode, skills, toolsets, t]);
    // Keep a valid selection: fall back to the first visible row when the
    // current selection is filtered out (or nothing is selected yet).
    const activeSkill = useMemo(() => visibleSkills.find(s => s.name === selectedSkill) ?? visibleSkills[0] ?? null, [selectedSkill, visibleSkills]);
    const activeToolset = useMemo(() => visibleToolsets.find(ts => ts.name === selectedToolset) ?? visibleToolsets[0] ?? null, [selectedToolset, visibleToolsets]);
    // Single toggles are optimistic and silent on success (the row repaints
    // immediately — a toast per flip would spam rapid customization). Errors
    // revert and notify.
    async function handleToggleSkill(skill, enabled) {
        setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled } : row)) ?? current);
        try {
            await toggleSkill(skill.name, enabled);
        }
        catch (err) {
            setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled: !enabled } : row)) ?? current);
            notifyError(err, t.skills.failedToUpdate(skill.name));
        }
    }
    async function handleToggleToolset(toolset, enabled) {
        setToolsets(current => current?.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row)) ?? current);
        try {
            await toggleToolset(toolset.name, enabled);
        }
        catch (err) {
            setToolsets(current => current?.map(row => (row.name === toolset.name ? { ...row, enabled: !enabled, available: !enabled } : row)) ??
                current);
            notifyError(err, t.skills.failedToUpdate(toolsetDisplayLabel(toolset)));
        }
    }
    // Sequential on purpose: each toggle is a config read-modify-write on the
    // backend; parallel calls would race the disabled-list save.
    async function bulkApply(skillTargets, toolsetTargets, enabled) {
        if (bulkBusy || skillTargets.length + toolsetTargets.length === 0) {
            return;
        }
        setBulkBusy(true);
        let done = 0;
        try {
            for (const row of skillTargets) {
                await toggleSkill(row.name, enabled);
                setSkills(cur => cur?.map(r => (r.name === row.name ? { ...r, enabled } : r)) ?? cur);
                done += 1;
            }
            for (const row of toolsetTargets) {
                await toggleToolset(row.name, enabled);
                setToolsets(cur => cur?.map(r => (r.name === row.name ? { ...r, enabled, available: enabled } : r)) ?? cur);
                done += 1;
            }
            notify({ kind: 'success', title: t.skills.bulkUpdated(done), message: '' });
        }
        catch (err) {
            notifyError(err, t.skills.failedToUpdate(mode === 'skills' ? t.skills.tabSkills : t.skills.tabToolsets));
        }
        finally {
            setBulkBusy(false);
        }
    }
    const bulkToggle = (enabled) => mode === 'skills'
        ? bulkApply(bulkSkills.filter(row => row.enabled !== enabled), [], enabled)
        : bulkApply([], bulkToolsets.filter(row => row.enabled !== enabled), enabled);
    // "Never used" = zero recorded activity. The pruning move for a 100+ skill
    // install: keep the workhorses, shed the noise.
    const disableUnused = () => bulkApply(bulkSkills.filter(skill => skill.enabled && usageOf(skill) === 0), [], false);
    // One switch line covering enable-all/disable-all.
    const bulkSwitch = (allEnabled) => ({
        checked: allEnabled,
        disabled: bulkBusy,
        label: t.skills.all,
        onToggle: checked => void bulkToggle(checked)
    });
    const allSkillsEnabled = bulkSkills.length > 0 && bulkSkills.every(s => s.enabled);
    const allToolsetsEnabled = bulkToolsets.length > 0 && bulkToolsets.every(ts => ts.enabled);
    const sortButton = (desc, flip) => (_jsx(ListStripButton, { onClick: flip, children: desc ? t.skills.sortMostUsedDesc : t.skills.sortLeastUsedAsc }));
    // Full-bleed empty state, matching the MCP tab (spans both columns, not a
    // cramped note in the left rail). Query-aware, and says "tools" not the
    // internal "toolsets".
    const capabilityEmpty = (noun) => {
        const q = query.trim();
        return (_jsx("div", { className: "flex h-full min-h-0 flex-1", children: _jsx(PanelEmpty, { description: q ? t.skills.emptyNothingMatches(q) : t.skills.emptyNoneAvailable(noun), icon: "search", title: t.skills.emptyNoneFound(noun) }) }));
    };
    // Learned/local skills are editable + archivable, mirroring the memory
    // graph (same /api/learning/node endpoints — delete archives, restorable
    // via `hermes curator restore`).
    const [skillEditor, setSkillEditor] = useState(null);
    const [skillDraft, setSkillDraft] = useState('');
    const [skillSaving, setSkillSaving] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState(null);
    // Bumped on profile switch so an in-flight openSkillEditor fetch from profile
    // A can't reopen the editor with A's content after switching to B.
    const skillEditorEpoch = useRef(0);
    // A profile switch swaps the backend under the open editor/archive dialog —
    // their targets belong to profile A, so a save/archive would hit B. Drop them
    // so nothing edits or archives against the newly active profile.
    useOnProfileSwitch(() => {
        skillEditorEpoch.current += 1;
        setSkillEditor(null);
        setSkillDraft('');
        setArchiveTarget(null);
    });
    const openSkillEditor = async (name) => {
        const epoch = skillEditorEpoch.current;
        try {
            const node = await getLearningNode(name);
            if (skillEditorEpoch.current !== epoch) {
                return;
            }
            setSkillEditor({ content: node.content, name });
            setSkillDraft(node.content);
        }
        catch (err) {
            notifyError(err, name);
        }
    };
    const saveSkillEdit = async () => {
        if (!skillEditor) {
            return;
        }
        setSkillSaving(true);
        try {
            await editLearningNode(skillEditor.name, skillDraft);
            notify({
                kind: 'success',
                title: t.skills.skillUpdated,
                message: t.skills.appliesToNewSessions(skillEditor.name)
            });
            setSkillEditor(null);
            void refreshCapabilities();
        }
        catch (err) {
            notifyError(err, skillEditor.name);
        }
        finally {
            setSkillSaving(false);
        }
    };
    const skillEditorPane = skillEditor && (_jsx(DetailPane, { actions: _jsx(Button, { disabled: skillSaving, onClick: () => void saveSkillEdit(), size: "xs", children: skillSaving ? t.common.saving : t.common.save }), id: "skill-editor", onClose: () => setSkillEditor(null), title: _jsxs("span", { className: "text-[0.68rem] font-normal text-muted-foreground/60", children: [skillEditor.name, "/SKILL.md"] }), children: _jsx(CodeEditor, { filePath: "SKILL.md", initialValue: skillEditor.content, onCancel: () => setSkillEditor(null), onChange: setSkillDraft, onSave: () => void saveSkillEdit() }, skillEditor.name) }));
    return (_jsxs(PageSearchShell, { ...props, activeTab: mode, onSearchChange: setQuery, onTabChange: id => setMode(id), 
        // MCP manages a handful of entries with the editor right there —
        // searching it is noise.
        searchHidden: mode === 'mcp', searchHints: searchHints, searchPlaceholder: mode === 'skills'
            ? t.skills.searchSkills
            : mode === 'hub'
                ? t.skills.hub.searchPlaceholder
                : t.skills.searchToolsets, searchValue: query, tabs: [
            { id: 'skills', label: t.skills.tabSkills, meta: skills?.length ?? null },
            { id: 'toolsets', label: t.skills.tabToolsets, meta: toolsets ? visibleToolsetCount(toolsets) : null },
            { id: 'mcp', label: t.skills.tabMcp },
            { id: 'hub', label: t.skills.tabHub }
        ], children: [mode === 'hub' ? (_jsx(SkillsHub, { query: query })) : mode === 'mcp' ? (_jsx(McpTab, { gateway: gateway })) : (skillsFailed || toolsetsFailed) && (!skills || !toolsets) ? (_jsx(PanelEmpty, { action: _jsx(Button, { onClick: () => void refreshCapabilities(), size: "sm", children: t.skills.refresh }), description: skillsError instanceof Error ? skillsError.message : undefined, icon: "error", title: t.skills.skillsLoadFailed })) : !skills || !toolsets ? (_jsx(PageLoader, { label: t.skills.loading })) : mode === 'skills' ? (visibleSkills.length === 0 ? (capabilityEmpty('skills')) : (_jsxs(MasterDetail, { pane: skillEditorPane, split: "wide", children: [_jsx(ListColumn, { header: _jsx(ListStrip, { left: sortButton(skillsSortDesc, () => $skillsSortDesc.set(!$skillsSortDesc.get())), right: _jsx(ListStripMenu, { items: [
                                    { disabled: bulkBusy, label: t.skills.disableUnused, onSelect: () => void disableUnused() }
                                ], label: t.skills.tabSkills, toggle: bulkSwitch(allSkillsEnabled) }) }), children: visibleSkills.map(skill => (_jsx(CapRow, { active: activeSkill?.name === skill.name, busy: bulkBusy, enabled: skill.enabled, meta: usageOf(skill) > 0 ? `×${compactNumber(usageOf(skill))}` : undefined, onSelect: () => setSelectedSkill(skill.name), onToggle: enabled => void handleToggleSkill(skill, enabled), subtitle: skillSubtitle(skill), title: skill.name, toggleLabel: skill.name }, skill.name))) }), _jsx(DetailColumn, { footer: t.skills.changesApplyNewSessions, children: activeSkill && (_jsx(SkillDetail, { onArchive: () => setArchiveTarget(activeSkill.name), onEdit: () => void openSkillEditor(activeSkill.name), skill: activeSkill })) })] }))) : visibleToolsets.length === 0 ? (capabilityEmpty('tools')) : (_jsxs(MasterDetail, { split: "wide", children: [_jsx(ListColumn, { header: _jsx(ListStrip, { left: sortButton(toolsetsSortDesc, () => $toolsetsSortDesc.set(!$toolsetsSortDesc.get())), right: _jsx(ListStripMenu, { label: t.skills.tabToolsets, toggle: bulkSwitch(allToolsetsEnabled) }) }), children: visibleToolsets.map(toolset => {
                            const label = toolsetDisplayLabel(toolset);
                            const calls = toolCalls ? toolsetCalls(toolset, toolCalls) : null;
                            return (_jsx(CapRow, { active: activeToolset?.name === toolset.name, busy: bulkBusy, enabled: toolset.enabled, meta: calls === null ? (_jsx(CountSkeleton, {})) : calls > 0 ? (`×${compactNumber(calls)}`) : (`${toolNames(toolset).length} tools`), onSelect: () => setSelectedToolset(toolset.name), onToggle: checked => void handleToggleToolset(toolset, checked), subtitle: asText(toolset.description), title: label, toggleLabel: t.skills.toggleToolset(label) }, toolset.name));
                        }) }), _jsx(DetailColumn, { footer: t.skills.changesApplyNewSessions, children: activeToolset && (_jsx(ToolsetDetail, { onConfiguredChange: refreshToolsets, toolCalls: toolCalls ?? {}, toolset: activeToolset })) })] })), archiveTarget && (_jsx(ArchiveSkillConfirmDialog, { onApply: () => {
                    const name = archiveTarget;
                    const snapshot = skills;
                    setSkills(current => current?.filter(skill => skill.name !== name) ?? current);
                    if (skillEditor?.name === name) {
                        setSkillEditor(null);
                    }
                    return () => setSkills(snapshot);
                }, onClose: () => setArchiveTarget(null), onFailure: (err, name) => notifyError(err, name), open: true, skillId: archiveTarget, skillName: archiveTarget }))] }));
}
// Shared inspector header — mirrors Messaging's PlatformDetail so Skills and
// Tools share one title/description block and tab switches don't jump.
function DetailHeader({ description, pills, title }) {
    return (_jsxs("header", { children: [_jsxs("div", { className: "flex min-h-6 flex-wrap items-center gap-2", children: [_jsx("h3", { className: "min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight", children: title }), pills] }), _jsx("p", { className: "mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: description })] }));
}
function SkillDetail({ onArchive, onEdit, skill }) {
    const { t } = useI18n();
    // Only learned/local skills are the user's to rewrite or archive — bundled
    // and hub skills are managed by their sources.
    const editable = skill.provenance === 'agent';
    return (_jsxs(_Fragment, { children: [_jsx(DetailHeader, { description: asText(skill.description) || t.skills.noDescription, pills: _jsxs(_Fragment, { children: [_jsx(PanelPill, { children: prettyName(categoryFor(skill)) }), skill.provenance && skill.provenance !== 'bundled' && (_jsx(PanelPill, { tone: skill.provenance === 'agent' ? 'good' : 'muted', children: t.skills.provenance[skill.provenance] }))] }), title: skill.name }), editable && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { onClick: onEdit, size: "xs", variant: "text", children: t.skills.edit }), _jsx(Button, { className: "text-destructive hover:text-destructive", onClick: onArchive, size: "xs", variant: "text", children: t.skills.archive })] }))] }));
}
function ToolsetDetail({ toolset, toolCalls, onConfiguredChange }) {
    const { t } = useI18n();
    const tools = toolNames(toolset);
    const label = toolsetDisplayLabel(toolset);
    return (_jsxs(_Fragment, { children: [_jsx(DetailHeader, { description: asText(toolset.description) || t.skills.noDescription, pills: !toolset.configured && _jsx(PanelPill, { tone: "warn", children: t.skills.needsKeys }), title: label }), tools.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1", children: tools.map(name => (_jsxs(ToolChip, { children: [name, (toolCalls[name] ?? 0) > 0 && (_jsxs("span", { className: "ml-1 text-(--ui-text-quaternary)", children: ["\u00D7", compactNumber(toolCalls[name])] }))] }, name))) })), toolset.name === 'computer_use' && _jsx(ComputerUsePanel, { onConfiguredChange: onConfiguredChange }), _jsx(ToolsetConfigPanel, { onConfiguredChange: onConfiguredChange, toolset: toolset.name }, toolset.name)] }));
}
