import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZoomableImage } from '@/components/chat/zoomable-image';
import { PageLoader } from '@/components/page-loader';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Pagination, PaginationButton, PaginationContent, PaginationEllipsis, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { RowButton } from '@/components/ui/row-button';
import { Tip } from '@/components/ui/tooltip';
import { getSessionMessages, listAllProfileSessions } from '@/hermes';
import { useI18n } from '@/i18n';
import { ExternalLink, ExternalLinkIcon, hostPathLabel, urlSlugTitleLabel, useLinkTitle } from '@/lib/external-link';
import { FileImage, FileText, FolderOpen, Link2, Loader2, RefreshCw } from '@/lib/icons';
import { downloadGatewayMediaFile, isRemoteGateway } from '@/lib/media';
import { normalize } from '@/lib/text';
import { fmtDayTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { notifyError } from '@/store/notifications';
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey';
import { useRouteEnumParam } from '../hooks/use-route-enum-param';
import { PageSearchShell } from '../page-search-shell';
import { sessionRoute } from '../routes';
import { ARTIFACT_FILTERS, artifactImageSrc, collectArtifactsForSession } from './artifact-utils';
function formatArtifactTime(timestamp) {
    return fmtDayTime.format(new Date(timestamp));
}
function pageRangeLabel(total, page, pageSize, a) {
    if (total === 0) {
        return a.zero;
    }
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(total, page * pageSize);
    return a.rangeOf(start, end, total);
}
function paginationItems(page, pageCount) {
    if (pageCount <= 7) {
        return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const pages = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(pageCount - 1, page + 1);
    if (start > 2) {
        pages.push('ellipsis');
    }
    for (let nextPage = start; nextPage <= end; nextPage += 1) {
        pages.push(nextPage);
    }
    if (end < pageCount - 1) {
        pages.push('ellipsis');
    }
    pages.push(pageCount);
    return pages;
}
const itemsLabel = (f, a) => f === 'link' ? a.itemsLink : f === 'file' ? a.itemsFile : a.itemsGeneric;
export function ArtifactsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }) {
    const { t } = useI18n();
    const a = t.artifacts;
    const navigate = useNavigate();
    const [artifacts, setArtifacts] = useState(null);
    const [query, setQuery] = useState('');
    const [kindFilter, setKindFilter] = useRouteEnumParam('tab', ARTIFACT_FILTERS, 'all');
    const [failedImageIds, setFailedImageIds] = useState(() => new Set());
    const [imagePage, setImagePage] = useState(1);
    const [filePage, setFilePage] = useState(1);
    const [refreshing, setRefreshing] = useState(false);
    const refreshArtifacts = useCallback(async () => {
        setRefreshing(true);
        try {
            const sessions = (await listAllProfileSessions(30, 1)).sessions;
            const results = await Promise.allSettled(sessions.map(session => getSessionMessages(session.id, session.profile)));
            const nextArtifacts = [];
            results.forEach((result, index) => {
                if (result.status !== 'fulfilled') {
                    return;
                }
                const session = sessions[index];
                nextArtifacts.push(...collectArtifactsForSession(session, result.value.messages));
            });
            setArtifacts(nextArtifacts.sort((left, right) => right.timestamp - left.timestamp));
        }
        catch (err) {
            notifyError(err, a.failedLoad);
            setArtifacts([]);
        }
        finally {
            setRefreshing(false);
        }
    }, [a]);
    useRefreshHotkey(refreshArtifacts);
    useEffect(() => {
        void refreshArtifacts();
    }, [refreshArtifacts]);
    useEffect(() => {
        setImagePage(1);
        setFilePage(1);
    }, [artifacts, kindFilter, query]);
    const visibleArtifacts = useMemo(() => {
        if (!artifacts) {
            return [];
        }
        const q = normalize(query);
        return artifacts.filter(artifact => {
            if (kindFilter !== 'all' && artifact.kind !== kindFilter) {
                return false;
            }
            if (!q) {
                return true;
            }
            return (artifact.label.toLowerCase().includes(q) ||
                artifact.value.toLowerCase().includes(q) ||
                artifact.sessionTitle.toLowerCase().includes(q));
        });
    }, [artifacts, kindFilter, query]);
    const visibleImageArtifacts = useMemo(() => visibleArtifacts.filter(artifact => artifact.kind === 'image'), [visibleArtifacts]);
    const visibleFileArtifacts = useMemo(() => visibleArtifacts.filter(artifact => artifact.kind !== 'image'), [visibleArtifacts]);
    const imagePageCount = Math.max(1, Math.ceil(visibleImageArtifacts.length / 24));
    const filePageCount = Math.max(1, Math.ceil(visibleFileArtifacts.length / 100));
    const currentImagePage = Math.min(imagePage, imagePageCount);
    const currentFilePage = Math.min(filePage, filePageCount);
    const pagedImageArtifacts = useMemo(() => visibleImageArtifacts.slice((currentImagePage - 1) * 24, currentImagePage * 24), [currentImagePage, visibleImageArtifacts]);
    const pagedFileArtifacts = useMemo(() => visibleFileArtifacts.slice((currentFilePage - 1) * 100, currentFilePage * 100), [currentFilePage, visibleFileArtifacts]);
    // Rotating placeholder nudges from real data — search matches file paths and
    // session titles, not just labels; show it.
    const searchHints = useMemo(() => {
        if (!artifacts?.length) {
            return undefined;
        }
        const extensions = [
            ...new Set(artifacts.map(artifact => /\.(\w{2,4})$/.exec(artifact.value)?.[1]?.toLowerCase()).filter(Boolean))
        ].slice(0, 3);
        const titles = [...new Set(artifacts.map(artifact => artifact.sessionTitle).filter(Boolean))].slice(0, 2);
        const hints = [
            ...extensions.map(ext => t.common.tryHint(`.${ext}`)),
            ...titles.map(title => t.common.tryHint(title))
        ];
        return hints.length > 0 ? hints : undefined;
    }, [artifacts, t]);
    const counts = useMemo(() => {
        const all = artifacts || [];
        return {
            all: all.length,
            image: all.filter(artifact => artifact.kind === 'image').length,
            file: all.filter(artifact => artifact.kind === 'file').length,
            link: all.filter(artifact => artifact.kind === 'link').length
        };
    }, [artifacts]);
    const openArtifact = useCallback(async (href) => {
        try {
            // A gateway-local file resolves to file:// in remote mode (the file
            // lives on the gateway, not this disk). Opening that locally fails —
            // and an OAuth remote connection has no query token to build a download
            // URL. Fetch the bytes over the authenticated fs bridge instead.
            if (isRemoteGateway() && /^file:/i.test(href)) {
                await downloadGatewayMediaFile(href);
                return;
            }
            if (window.hermesDesktop?.openExternal) {
                await window.hermesDesktop.openExternal(href);
            }
            else {
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        }
        catch (err) {
            notifyError(err, a.openFailed);
        }
    }, [a]);
    const markImageFailed = useCallback((id) => {
        setFailedImageIds(current => {
            if (current.has(id)) {
                return current;
            }
            return new Set(current).add(id);
        });
    }, []);
    const cellCtx = {
        onOpen: openArtifact,
        onOpenChat: sessionId => navigate(sessionRoute(sessionId))
    };
    return (_jsx(PageSearchShell, { ...props, activeTab: kindFilter, onSearchChange: setQuery, onTabChange: id => setKindFilter(id), searchHidden: counts.all === 0, searchHints: searchHints, searchPlaceholder: a.search, searchTrailingAction: _jsx(Tip, { label: refreshing ? a.refreshing : a.refresh, children: _jsx(Button, { "aria-label": refreshing ? a.refreshing : a.refresh, className: "text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground", disabled: refreshing, onClick: () => void refreshArtifacts(), size: "icon-titlebar", variant: "ghost", children: refreshing ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(RefreshCw, {}) }) }), searchValue: query, tabs: [
            { id: 'all', label: a.tabAll, meta: artifacts ? counts.all : null },
            { id: 'image', label: a.tabImages, meta: artifacts ? counts.image : null },
            { id: 'file', label: a.tabFiles, meta: artifacts ? counts.file : null },
            { id: 'link', label: a.tabLinks, meta: artifacts ? counts.link : null }
        ], children: !artifacts ? (_jsx(PageLoader, { label: a.indexing })) : visibleArtifacts.length === 0 ? (_jsx("div", { className: "grid h-full place-items-center px-6 text-center", children: _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium", children: a.noArtifactsTitle }), _jsx("div", { className: "mt-1 text-xs text-muted-foreground", children: a.noArtifactsDesc })] }) })) : (_jsx("div", { className: "h-full overflow-y-auto [scrollbar-gutter:stable]", children: _jsxs("div", { className: "flex flex-col gap-3 px-3 pb-2", children: [visibleImageArtifacts.length > 0 && (_jsxs("section", { className: "flex flex-col", children: [_jsx("div", { className: "sticky top-0 z-10 -mx-3 flex h-7 items-center gap-3 overflow-x-auto bg-background px-3", children: _jsx(ArtifactsPagination, { className: "ml-auto justify-end px-0", itemLabel: a.itemsImage, onPageChange: setImagePage, page: currentImagePage, pageSize: 24, total: visibleImageArtifacts.length }) }), _jsx("div", { className: "grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] items-start gap-2 pt-1.5", children: pagedImageArtifacts.map(artifact => (_jsx(ArtifactImageCard, { artifact: artifact, failedImage: failedImageIds.has(artifact.id), onImageError: markImageFailed, onOpenChat: sessionId => navigate(sessionRoute(sessionId)) }, artifact.id))) })] })), visibleFileArtifacts.length > 0 && (_jsxs("section", { className: "flex flex-col", children: [_jsx("div", { className: "sticky top-0 z-10 -mx-3 flex h-7 items-center gap-3 overflow-x-auto bg-background px-3", children: _jsx(ArtifactsPagination, { className: "ml-auto justify-end px-0", itemLabel: itemsLabel(kindFilter, a), onPageChange: setFilePage, page: currentFilePage, pageSize: 100, total: visibleFileArtifacts.length }) }), _jsx("div", { className: "overflow-x-auto rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background)", children: _jsx(ArtifactTable, { artifacts: pagedFileArtifacts, ctx: cellCtx, filter: kindFilter }) })] }))] }) })) }));
}
function ArtifactsPagination({ className, itemLabel, onPageChange, page, pageSize, total }) {
    const { t } = useI18n();
    const a = t.artifacts;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    return (_jsxs("div", { className: cn('flex h-6 items-center justify-between gap-2 px-1', className), children: [_jsxs("div", { className: "shrink-0 text-[0.62rem] text-muted-foreground", children: [pageRangeLabel(total, page, pageSize, a), " ", itemLabel] }), pageCount > 1 && (_jsx(Pagination, { className: "mx-0 w-auto min-w-0 justify-end", children: _jsxs(PaginationContent, { className: "gap-0.5", children: [_jsx(PaginationItem, { children: _jsx(PaginationPrevious, { disabled: page <= 1, onClick: () => onPageChange(Math.max(1, page - 1)) }) }), paginationItems(page, pageCount).map((item, index) => (_jsx(PaginationItem, { children: item === 'ellipsis' ? (_jsx(PaginationEllipsis, {})) : (_jsx(PaginationButton, { "aria-label": a.goToPage(itemLabel, item), isActive: page === item, onClick: () => onPageChange(item), children: item })) }, `${item}-${index}`))), _jsx(PaginationItem, { children: _jsx(PaginationNext, { disabled: page >= pageCount, onClick: () => onPageChange(Math.min(pageCount, page + 1)) }) })] }) }))] }));
}
function ArtifactImageCard({ artifact, failedImage, onImageError, onOpenChat }) {
    const { t } = useI18n();
    const a = t.artifacts;
    const kindLabel = artifact.kind === 'image' ? a.kindImage : artifact.kind === 'file' ? a.kindFile : a.kindLink;
    const [src, setSrc] = useState('');
    useEffect(() => {
        let active = true;
        setSrc('');
        void artifactImageSrc(artifact.value, artifact.href)
            .then(nextSrc => {
            if (active) {
                setSrc(nextSrc);
            }
        })
            .catch(() => {
            if (active) {
                onImageError(artifact.id);
            }
        });
        return () => {
            active = false;
        };
    }, [artifact.href, artifact.id, artifact.value, onImageError]);
    return (_jsxs("article", { className: "group/artifact overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background)", children: [_jsx("div", { className: cn('relative flex h-40 w-full items-center justify-center overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-1.5', failedImage && 'cursor-default'), children: !failedImage && src && (_jsx(ZoomableImage, { alt: artifact.label, className: "max-h-40 max-w-full cursor-zoom-in rounded-md object-contain", containerClassName: "max-h-full", decoding: "async", loading: "lazy", onError: () => onImageError(artifact.id), slot: "artifact-media", src: src })) }), _jsxs("div", { className: "space-y-1.5 p-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "mb-0.5 flex items-center gap-1 text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)", children: [_jsx(FileImage, { className: "size-3" }), kindLabel] }), _jsx("div", { className: "truncate text-[length:var(--conversation-caption-font-size)] font-medium", children: artifact.label }), _jsx("div", { className: "mt-0.5 truncate text-[0.625rem] text-(--ui-text-tertiary)", children: artifact.value })] }), _jsxs("div", { className: "truncate text-[0.625rem] text-(--ui-text-tertiary)", children: [artifact.sessionTitle, " \u00B7 ", formatArtifactTime(artifact.timestamp)] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: _jsxs(Button, { onClick: () => onOpenChat(artifact.sessionId), size: "xs", type: "button", variant: "textStrong", children: [_jsx(FolderOpen, { className: "size-3" }), a.chat] }) })] })] }));
}
// Single click target for any row cell. External URLs render as <ExternalLink>;
// local actions render as <button>. Padding lives here, NOT on the <td>, so
// the entire cell area is hoverable and clickable in both branches.
function ArtifactCellAction({ children, href, onClick, title }) {
    if (href) {
        return (_jsx(ExternalLink, { className: "flex h-full w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) font-normal text-(--ui-text-secondary) no-underline underline-offset-4 decoration-current/20 transition-colors hover:text-foreground hover:underline", href: href, showExternalIcon: false, title: title, children: children }));
    }
    return (_jsx(RowButton, { className: "flex h-full w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) font-normal text-(--ui-text-secondary) no-underline underline-offset-4 decoration-current/20 transition-colors hover:text-foreground hover:underline", onClick: onClick, children: children }));
}
function PrimaryCell({ artifact, ctx }) {
    const isLink = artifact.kind === 'link';
    const Icon = isLink ? Link2 : FileText;
    const fetchedTitle = useLinkTitle(isLink ? artifact.href : null);
    const label = isLink ? fetchedTitle || urlSlugTitleLabel(artifact.href) : artifact.label;
    return (_jsxs(ArtifactCellAction, { href: isLink ? artifact.href : undefined, onClick: isLink ? undefined : () => void ctx.onOpen(artifact.href), title: label, children: [_jsx("span", { className: "mt-0.5 grid size-6 shrink-0 place-items-center self-start rounded-md bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)", children: _jsx(Icon, { className: "size-3.5" }) }), _jsxs("span", { className: cn('min-w-0 flex-1', isLink ? 'wrap-anywhere' : 'truncate'), children: [label, isLink && _jsx(ExternalLinkIcon, {})] })] }));
}
function LocationCell({ artifact }) {
    const { t } = useI18n();
    const isLink = artifact.kind === 'link';
    const value = isLink ? hostPathLabel(artifact.value) : artifact.value;
    const copyLabel = isLink ? t.artifacts.copyUrl : t.artifacts.copyPath;
    return (_jsxs("div", { className: "group/location flex min-w-0 items-center gap-1.5", children: [_jsx(Tip, { label: artifact.value, children: _jsx("div", { className: cn('min-w-0 flex-1 truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)', isLink ? 'font-normal' : 'font-mono'), children: value }) }), _jsx(CopyButton, { appearance: "icon", buttonSize: "icon-xs", className: "shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/location:opacity-100", iconClassName: "size-3.5", label: copyLabel, text: artifact.value, title: copyLabel })] }));
}
function SessionCell({ artifact, ctx }) {
    return (_jsx(ArtifactCellAction, { onClick: () => ctx.onOpenChat(artifact.sessionId), title: artifact.sessionTitle, children: _jsxs("span", { className: "flex min-w-0 flex-col", children: [_jsx("span", { className: "truncate", children: artifact.sessionTitle }), _jsx("span", { className: "truncate text-[0.6875rem] font-normal text-(--ui-text-tertiary)", children: formatArtifactTime(artifact.timestamp) })] }) }));
}
const ARTIFACT_COLUMNS = [
    {
        Cell: PrimaryCell,
        bodyClassName: 'p-0',
        header: (filter, a) => filter === 'link' ? a.colTitleLink : filter === 'file' ? a.colTitleFile : a.colTitleDefault,
        id: 'primary',
        width: filter => (filter === 'link' ? 'w-[50%]' : 'w-[35%]')
    },
    {
        Cell: LocationCell,
        bodyClassName: 'px-2.5 py-1.5',
        header: (filter, a) => filter === 'link' ? a.colLocationLink : filter === 'file' ? a.colLocationFile : a.colLocationDefault,
        id: 'location',
        width: filter => (filter === 'link' ? 'w-[30%]' : 'w-[41%]')
    },
    {
        Cell: SessionCell,
        bodyClassName: 'p-0',
        header: (_filter, a) => a.colSession,
        id: 'session',
        width: filter => (filter === 'link' ? 'w-[20%]' : 'w-[24%]')
    }
];
function ArtifactTable({ artifacts, ctx, filter }) {
    const { t } = useI18n();
    return (_jsxs("table", { className: "w-full min-w-176 table-fixed text-left text-[length:var(--conversation-caption-font-size)]", children: [_jsx("thead", { className: "border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)", children: _jsx("tr", { children: ARTIFACT_COLUMNS.map(col => (_jsx("th", { className: cn(col.width(filter), 'px-2.5 py-1.5 font-medium'), children: col.header(filter, t.artifacts) }, col.id))) }) }), _jsx("tbody", { children: artifacts.map(artifact => (_jsx("tr", { className: "group/artifact", children: ARTIFACT_COLUMNS.map(col => {
                        const Cell = col.Cell;
                        return (_jsx("td", { className: cn('align-middle', col.bodyClassName), children: _jsx(Cell, { artifact: artifact, ctx: ctx }) }, col.id));
                    }) }, artifact.id))) })] }));
}
