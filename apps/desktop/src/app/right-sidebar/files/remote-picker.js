import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { readDesktopDir, setDesktopFsRemotePicker } from '@/lib/desktop-fs';
import { cn } from '@/lib/utils';
function clean(path) {
    return path.replace(/\/+$/, '') || '/';
}
function parentDir(path) {
    const value = clean(path);
    if (value === '/') {
        return '/';
    }
    const parent = value.slice(0, value.lastIndexOf('/'));
    return parent || '/';
}
function pathName(path) {
    return path.split('/').filter(Boolean).pop() || path;
}
export function RemoteFolderPicker() {
    const { t } = useI18n();
    const r = t.rightSidebar;
    const [pending, setPending] = useState(null);
    const [currentPath, setCurrentPath] = useState('/');
    const [entries, setEntries] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        setDesktopFsRemotePicker({
            selectPaths: options => new Promise(resolve => {
                const defaultPath = clean(options?.defaultPath || '/');
                setCurrentPath(defaultPath);
                setPending({ defaultPath, resolve, title: options?.title || r.remotePickerTitle });
            })
        });
        return () => setDesktopFsRemotePicker(null);
    }, [r.remotePickerTitle]);
    useEffect(() => {
        if (!pending) {
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        void readDesktopDir(currentPath)
            .then(result => {
            if (!active) {
                return;
            }
            if (result.error) {
                setError(result.error);
                setEntries([]);
                return;
            }
            setEntries(result.entries.filter(entry => entry.isDirectory).map(entry => ({ name: entry.name, path: entry.path })));
        })
            .catch(err => {
            if (active) {
                setError(err instanceof Error ? err.message : String(err));
                setEntries([]);
            }
        })
            .finally(() => {
            if (active) {
                setLoading(false);
            }
        });
        return () => {
            active = false;
        };
    }, [currentPath, pending]);
    const crumbs = useMemo(() => {
        const parts = clean(currentPath).split('/').filter(Boolean);
        const out = [{ label: '/', path: '/' }];
        let acc = '';
        for (const part of parts) {
            acc += `/${part}`;
            out.push({ label: part, path: acc });
        }
        return out;
    }, [currentPath]);
    const close = (paths = []) => {
        pending?.resolve(paths);
        setPending(null);
        setEntries([]);
        setError(null);
    };
    return (_jsx(Dialog, { onOpenChange: open => !open && close(), open: Boolean(pending), children: _jsxs(DialogContent, { className: "flex h-[min(36rem,calc(100vh-4rem))] max-w-lg flex-col gap-0 overflow-hidden p-0", children: [_jsxs("div", { className: "shrink-0 border-b border-border/70 px-4 py-3", children: [_jsx(DialogTitle, { className: "text-sm", children: pending?.title || r.remotePickerTitle }), _jsx(DialogDescription, { className: "mt-1 text-xs", children: r.remotePickerDescription })] }), _jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [_jsx("div", { className: "shrink-0 flex flex-wrap items-center gap-1 border-b border-border/50 px-3 py-2 text-xs text-muted-foreground", children: crumbs.map((crumb, index) => (_jsx("button", { className: cn('rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground', index === crumbs.length - 1 && 'text-foreground'), onClick: () => setCurrentPath(crumb.path), type: "button", children: crumb.label }, crumb.path))) }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto p-2", children: [_jsx(FolderRow, { disabled: currentPath === '/', name: "..", onClick: () => setCurrentPath(parentDir(currentPath)) }), loading ? (_jsxs("div", { className: "flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground", children: [_jsx(Codicon, { name: "loading", size: "0.8rem", spinning: true }), r.loadingFiles] })) : error ? (_jsx("div", { className: "px-2 py-3 text-xs text-destructive", children: r.unreadableBody(error) })) : entries.length === 0 ? (_jsx("div", { className: "px-2 py-3 text-xs text-muted-foreground", children: r.emptyBody })) : (entries.map(entry => (_jsx(FolderRow, { name: pathName(entry.path), onClick: () => setCurrentPath(entry.path) }, entry.path))))] })] }), _jsxs("div", { className: "shrink-0 flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3", children: [_jsx("div", { className: "min-w-0 truncate text-xs text-muted-foreground", children: currentPath }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx(Button, { onClick: () => close(), size: "sm", variant: "ghost", children: t.common.cancel }), _jsx(Button, { onClick: () => close([currentPath]), size: "sm", children: r.remotePickerSelect })] })] })] }) }));
}
function FolderRow({ disabled = false, name, onClick }) {
    return (_jsxs("button", { className: "row-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-(--ui-text-secondary) hover:text-foreground disabled:pointer-events-none disabled:opacity-40", disabled: disabled, onClick: onClick, type: "button", children: [_jsx(Codicon, { name: "folder", size: "0.875rem" }), _jsx("span", { className: "min-w-0 truncate", children: name })] }));
}
