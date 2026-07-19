import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Cmd-K "Install theme…" page.
 *
 * Browses the VS Code Marketplace for color themes: an empty query shows the
 * most-installed themes, typing runs a live (debounced) search against the
 * Marketplace. Selecting a row downloads + converts + installs it via the same
 * pipeline as the settings importer, then activates it — and stays open so the
 * user can grab several.
 */
import { useStore } from '@nanostores/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HUD_ITEM, HUD_TEXT } from '@/app/floating-hud';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Check, Download, Loader2, Palette } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { installVscodeThemeFromMarketplace } from '@/themes/install';
import { $marketplaceInstalls } from '@/themes/user-themes';
const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
function useDebounced(value, delayMs) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
    }, [value, delayMs]);
    return debounced;
}
export function MarketplaceThemePage({ search, onPickTheme }) {
    const { t } = useI18n();
    const copy = t.commandCenter.installTheme;
    const debouncedSearch = useDebounced(search.trim(), 300);
    const installs = useStore($marketplaceInstalls);
    const [installingId, setInstallingId] = useState(null);
    const [installError, setInstallError] = useState(null);
    const query = useQuery({
        queryKey: ['marketplace-themes', debouncedSearch],
        queryFn: () => window.hermesDesktop?.themes?.searchMarketplace(debouncedSearch) ?? Promise.resolve([]),
        staleTime: 5 * 60 * 1000
    });
    // Already installed → just re-activate it; never re-download what we have.
    const select = (item) => {
        const owned = installs.get(item.extensionId);
        if (owned) {
            triggerHaptic('crisp');
            onPickTheme(owned.name);
            return;
        }
        void install(item);
    };
    const install = async (item) => {
        if (installingId) {
            return;
        }
        setInstallingId(item.extensionId);
        setInstallError(null);
        try {
            const theme = await installVscodeThemeFromMarketplace(item.extensionId);
            triggerHaptic('crisp');
            onPickTheme(theme.name);
        }
        catch (error) {
            setInstallError(error instanceof Error ? error.message : copy.error);
        }
        finally {
            setInstallingId(null);
        }
    };
    if (query.isLoading) {
        return _jsx(Status, { icon: _jsx(Loader2, { className: "size-3.5 animate-spin" }), text: copy.loading });
    }
    if (query.isError) {
        return _jsx(Status, { text: copy.error, tone: "error" });
    }
    const results = query.data ?? [];
    if (results.length === 0) {
        return _jsx(Status, { text: copy.empty });
    }
    return (_jsxs("div", { role: "listbox", children: [installError && _jsx("p", { className: "px-2 pb-1 pt-1.5 text-[0.6875rem] text-(--ui-red)", children: installError }), results.map(item => {
                const busy = installingId === item.extensionId;
                const done = installs.has(item.extensionId);
                return (_jsxs("button", { className: cn('flex w-full items-start rounded-md text-left transition-colors hover:bg-(--chrome-action-hover) disabled:opacity-60 aria-disabled:opacity-60', HUD_ITEM, HUD_TEXT), disabled: Boolean(installingId) && !busy, onClick: () => select(item), onMouseDown: event => event.preventDefault(), role: "option", type: "button", children: [_jsx(Palette, { className: "mt-0.5 size-3.5 shrink-0 text-muted-foreground" }), _jsxs("span", { className: "flex min-w-0 flex-col", children: [_jsx("span", { className: "truncate font-medium", children: item.displayName }), _jsxs("span", { className: "truncate text-[0.6875rem] text-muted-foreground/80", children: [item.publisher, item.installs > 0 ? ` · ${copy.installs(compactNumber.format(item.installs))}` : ''] })] }), _jsx("span", { className: "ml-auto mt-0.5 flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted-foreground", children: busy ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "size-3 animate-spin" }), copy.installing] })) : done ? (_jsxs(_Fragment, { children: [_jsx(Check, { className: "size-3 text-(--ui-green)" }), copy.installed] })) : (_jsxs(_Fragment, { children: [_jsx(Download, { className: "size-3" }), copy.install] })) })] }, item.extensionId));
            })] }));
}
function Status({ icon, text, tone }) {
    return (_jsxs("div", { className: cn('flex items-center justify-center gap-2 px-2 py-6 text-xs', tone === 'error' ? 'text-(--ui-red)' : 'text-muted-foreground'), children: [icon, text] }));
}
