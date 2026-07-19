import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Check, Download, Loader2, Palette, Trash2 } from '@/lib/icons';
import { selectableCardClass } from '@/lib/selectable-card';
import { normalize } from '@/lib/text';
import { cn } from '@/lib/utils';
import { $embedAllowed, $embedMode, clearEmbedAllowed, setEmbedMode } from '@/store/embed-consent';
import { $activeGatewayProfile, $profiles, normalizeProfileKey } from '@/store/profile';
import { $toolViewMode, setToolViewMode } from '@/store/tool-view';
import { $translucency, setTranslucency } from '@/store/translucency';
import { $zoomPercent, setZoomPercent } from '@/store/zoom';
import { getBaseColors, useTheme } from '@/themes/context';
import { installVscodeThemeFromMarketplace } from '@/themes/install';
import { $marketplaceInstalls, isUserTheme, removeUserTheme } from '@/themes/user-themes';
import { MODE_OPTIONS } from './constants';
import { PetSettings } from './pet-settings';
import { ListRow, SectionHeading, SettingsContent } from './primitives';
function ThemePreview({ name, mode }) {
    // Preview in the *current* mode: the dark palette in Dark, and the light
    // palette in Light — synthesizing one for dark-only themes — so every card
    // tracks the Light/Dark toggle, exactly like the app itself does.
    const c = getBaseColors(name, mode);
    return (_jsx("div", { className: "h-20 overflow-hidden rounded-xl border shadow-xs", style: { backgroundColor: c.background, borderColor: c.border }, children: _jsxs("div", { className: "flex h-full", children: [_jsx("div", { className: "w-12 border-r", style: {
                        backgroundColor: c.sidebarBackground ?? c.muted,
                        borderColor: c.sidebarBorder ?? c.border
                    } }), _jsxs("div", { className: "flex flex-1 flex-col gap-2 p-3", children: [_jsx("div", { className: "h-2.5 w-16 rounded-full", style: { backgroundColor: c.foreground } }), _jsx("div", { className: "h-2 w-24 rounded-full", style: { backgroundColor: c.mutedForeground } }), _jsx("div", { className: "mt-auto flex justify-end", children: _jsx("div", { className: "h-5 w-16 rounded-full border", style: {
                                    backgroundColor: c.userBubble ?? c.muted,
                                    borderColor: c.userBubbleBorder ?? c.border
                                } }) })] })] }) }));
}
// UI scale presets, as zoom percentages. 100 is the browser-default size;
// the ids double as the percent values sent to the main process. A Cmd/Ctrl
// +/- step landing between presets highlights nothing, and the row
// description keeps showing the exact current percent.
const UI_SCALE_PRESETS = ['90', '100', '110', '125', '150', '175'];
function matchUiScalePreset(percent) {
    return UI_SCALE_PRESETS.find(preset => Number(preset) === percent) ?? null;
}
function useDebounced(value, delayMs) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
    }, [value, delayMs]);
    return debounced;
}
const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
/**
 * Live VS Code Marketplace theme search (the same backend as the Cmd-K "Install
 * theme…" page). Renders below the local grid when there's a query: each row
 * downloads + converts + installs via `installVscodeThemeFromMarketplace` and
 * activates it. Extensions already imported locally are marked installed.
 */
function MarketplaceThemeResults({ query, installs, onInstalled }) {
    const { t } = useI18n();
    const copy = t.commandCenter.installTheme;
    const debounced = useDebounced(query.trim(), 300);
    const [installingId, setInstallingId] = useState(null);
    const [error, setError] = useState(null);
    const search = useQuery({
        enabled: debounced.length > 0,
        queryFn: () => window.hermesDesktop?.themes?.searchMarketplace(debounced) ?? Promise.resolve([]),
        queryKey: ['marketplace-themes-settings', debounced],
        staleTime: 5 * 60 * 1000
    });
    // Already installed → just re-activate it; never re-download what we have.
    const select = (item) => {
        const owned = installs.get(item.extensionId);
        if (owned) {
            triggerHaptic('crisp');
            onInstalled(owned.name);
            return;
        }
        void install(item);
    };
    const install = async (item) => {
        if (installingId) {
            return;
        }
        setInstallingId(item.extensionId);
        setError(null);
        try {
            const theme = await installVscodeThemeFromMarketplace(item.extensionId);
            triggerHaptic('crisp');
            onInstalled(theme.name);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : copy.error);
        }
        finally {
            setInstallingId(null);
        }
    };
    if (!debounced) {
        return null;
    }
    const header = (_jsx("p", { className: "mb-2 mt-4 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary)", children: "From the VS Code Marketplace" }));
    if (search.isLoading) {
        return (_jsxs(_Fragment, { children: [header, _jsxs("p", { className: "flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), copy.loading] })] }));
    }
    if (search.isError) {
        return (_jsxs(_Fragment, { children: [header, _jsx("p", { className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-red)", children: copy.error })] }));
    }
    const results = search.data ?? [];
    if (results.length === 0) {
        return (_jsxs(_Fragment, { children: [header, _jsx("p", { className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: copy.empty })] }));
    }
    return (_jsxs(_Fragment, { children: [header, error && _jsx("p", { className: "mb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-red)", children: error }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: results.map(item => {
                    const busy = installingId === item.extensionId;
                    const done = installs.has(item.extensionId);
                    return (_jsxs("button", { className: cn('flex items-center gap-2.5 px-2.5 py-2 text-left disabled:opacity-60', selectableCardClass({ prominent: done })), disabled: Boolean(installingId) && !busy, onClick: () => select(item), type: "button", children: [_jsx(Palette, { className: "size-4 shrink-0 text-(--ui-text-tertiary)" }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-[length:var(--conversation-text-font-size)] font-medium", children: item.displayName }), _jsxs("span", { className: "block truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: [item.publisher, item.installs > 0 ? ` · ${copy.installs(compactNumber.format(item.installs))}` : ''] })] }), _jsx("span", { className: "shrink-0 text-(--ui-text-tertiary)", children: busy ? (_jsx(Loader2, { className: "size-4 animate-spin" })) : done ? (_jsx(Check, { className: "size-4 text-(--ui-green)" })) : (_jsx(Download, { className: "size-4" })) })] }, item.extensionId));
                }) })] }));
}
export function AppearanceSettings() {
    const { t, isSavingLocale } = useI18n();
    const { themeName, mode, resolvedMode, availableThemes, setTheme, setMode } = useTheme();
    const toolViewMode = useStore($toolViewMode);
    const zoomPercent = useStore($zoomPercent);
    const embedMode = useStore($embedMode);
    const embedAllowed = useStore($embedAllowed);
    const translucency = useStore($translucency);
    const installs = useStore($marketplaceInstalls);
    const profiles = useStore($profiles);
    const activeProfileKey = normalizeProfileKey(useStore($activeGatewayProfile));
    const a = t.settings.appearance;
    const [query, setQuery] = useState('');
    // One box does double duty: filter installed themes live (below), and run a
    // name search against the VS Code Marketplace (the Cmd-K "Install theme…"
    // backend) for anything not already installed.
    const needle = normalize(query);
    const filteredThemes = availableThemes
        .filter(theme => !needle ||
        theme.label.toLowerCase().includes(needle) ||
        theme.name.toLowerCase().includes(needle) ||
        theme.description.toLowerCase().includes(needle))
        // Active theme first; stable sort keeps the rest in their original order.
        .sort((a, b) => Number(b.name === themeName) - Number(a.name === themeName));
    // Themes save per profile. Surface that only when the user actually has more
    // than one profile (single-profile installs never see the distinction).
    const showProfileNote = profiles.length > 1;
    const activeProfileName = profiles.find(profile => normalizeProfileKey(profile.name) === activeProfileKey)?.name ?? activeProfileKey;
    const modeOptions = MODE_OPTIONS.map(({ id, icon }) => ({ icon, id, label: t.settings.modeOptions[id].label }));
    const toolOptions = [
        { id: 'product', label: a.product },
        { id: 'technical', label: a.technical }
    ];
    const embedOptions = [
        { id: 'ask', label: a.embedsAsk },
        { id: 'always', label: a.embedsAlways },
        { id: 'off', label: a.embedsOff }
    ];
    const uiScaleOptions = UI_SCALE_PRESETS.map(preset => ({ id: preset, label: `${preset}%` }));
    const matchedScalePreset = matchUiScalePreset(zoomPercent);
    return (_jsxs(SettingsContent, { children: [_jsxs("div", { children: [_jsx(SectionHeading, { icon: Palette, title: a.title }), _jsx("p", { className: "max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: a.intro }), _jsxs("div", { className: "mt-2", children: [_jsx(ListRow, { action: _jsx(LanguageSwitcher, {}), description: isSavingLocale ? t.language.saving : t.language.description, title: t.language.label }), _jsx(ListRow, { below: _jsxs(_Fragment, { children: [_jsx("div", { className: "mt-3", children: _jsx("input", { className: "w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-1.5 text-[length:var(--conversation-caption-font-size)] outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-stroke-secondary)", onChange: event => setQuery(event.target.value), placeholder: "Search your themes or the VS Code Marketplace\u2026", spellCheck: false, value: query }) }), _jsxs("div", { className: "mt-3 max-h-96 overflow-y-auto pr-1", children: [filteredThemes.length === 0 ? (needle ? (_jsxs("p", { className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)", children: ["No installed themes match \"", query.trim(), "\"."] })) : null) : (_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: filteredThemes.map(theme => {
                                                        const active = themeName === theme.name;
                                                        const removable = isUserTheme(theme.name);
                                                        return (_jsxs("div", { className: "group relative", children: [_jsxs("button", { className: cn('w-full p-2 text-left', selectableCardClass({ active, prominent: true })), onClick: () => {
                                                                        triggerHaptic('crisp');
                                                                        setTheme(theme.name);
                                                                    }, type: "button", children: [_jsx(ThemePreview, { mode: resolvedMode, name: theme.name }), _jsxs("div", { className: "mt-3 px-1", children: [_jsx("div", { className: "truncate text-[length:var(--conversation-text-font-size)] font-medium", children: theme.label }), _jsx("div", { className: "mt-0.5 line-clamp-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: theme.description })] })] }), removable && (_jsx("button", { "aria-label": a.removeTheme, className: "absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-(--ui-bg-elevated)/80 text-(--ui-text-tertiary) opacity-0 backdrop-blur-sm transition hover:text-(--ui-red) focus-visible:opacity-100 group-hover:opacity-100", onClick: () => {
                                                                        triggerHaptic('crisp');
                                                                        removeUserTheme(theme.name);
                                                                        // Re-normalize off the now-missing skin → default.
                                                                        if (active) {
                                                                            setTheme(theme.name);
                                                                        }
                                                                    }, title: a.removeTheme, type: "button", children: _jsx(Trash2, { className: "size-3.5" }) }))] }, theme.name));
                                                    }) })), _jsx(MarketplaceThemeResults, { installs: installs, onInstalled: name => setTheme(name), query: query })] }), showProfileNote && (_jsx("p", { className: "mt-3 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: a.themeProfileNote(activeProfileName) }))] }), description: a.themeDesc, title: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("span", { children: a.themeTitle }), _jsx(SegmentedControl, { onChange: id => {
                                                triggerHaptic('crisp');
                                                setMode(id);
                                            }, options: modeOptions, value: mode })] }), wide: true }), _jsx(ListRow, { action: _jsx(SegmentedControl, { onChange: id => {
                                        triggerHaptic('selection');
                                        setZoomPercent(Number(id));
                                    }, options: uiScaleOptions, value: matchedScalePreset ?? '' }), description: a.uiScaleDesc(zoomPercent), title: a.uiScaleTitle }), _jsx(ListRow, { action: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { "aria-label": a.translucencyTitle, className: "h-1 w-40 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary)", max: 100, min: 0, onChange: event => {
                                                triggerHaptic('selection');
                                                setTranslucency(Number(event.target.value));
                                            }, step: 5, style: { accentColor: 'var(--dt-primary)' }, type: "range", value: translucency }), _jsxs("span", { className: "w-9 text-right text-[length:var(--conversation-caption-font-size)] tabular-nums text-(--ui-text-tertiary)", children: [translucency, "%"] })] }), description: a.translucencyDesc, title: a.translucencyTitle }), _jsx(ListRow, { action: _jsx(SegmentedControl, { onChange: id => {
                                        triggerHaptic('selection');
                                        setToolViewMode(id);
                                    }, options: toolOptions, value: toolViewMode }), description: a.toolViewDesc, title: a.toolViewTitle }), _jsx(ListRow, { action: _jsxs("div", { className: "flex flex-col items-end gap-1.5", children: [_jsx(SegmentedControl, { onChange: id => {
                                                triggerHaptic('selection');
                                                setEmbedMode(id);
                                            }, options: embedOptions, value: embedMode }), embedAllowed.length > 0 && (_jsx(Button, { onClick: () => {
                                                triggerHaptic('selection');
                                                clearEmbedAllowed();
                                            }, size: "inline", variant: "text", children: a.embedsReset(embedAllowed.length) }))] }), description: a.embedsDesc, title: a.embedsTitle })] })] }), _jsx("div", { className: "mt-6", children: _jsx(PetSettings, {}) })] }));
}
