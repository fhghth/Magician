import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { listAllProfileSessions } from '@/hermes';
import { useI18n } from '@/i18n';
import { sessionTitle } from '@/lib/chat-runtime';
import { Check, MessageCircle } from '@/lib/icons';
import { cn } from '@/lib/utils';
/**
 * Desktop equivalent of the TUI's sessions overlay (`/resume`, `/sessions`,
 * `/switch`): a focused, type-to-filter list of recent sessions that resumes
 * the picked one. Mirrors the command palette's cmdk surface but scoped to
 * sessions only, so `/resume` feels first-class instead of falling through to
 * the headless slash worker (which can't render the picker).
 */
export function SessionPickerDialog({ activeStoredSessionId, onOpenChange, onResume, open }) {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const sessionsQuery = useQuery({
        enabled: open,
        queryFn: () => listAllProfileSessions(200, 1, 'exclude'),
        queryKey: ['session-picker', 'sessions']
    });
    useEffect(() => {
        if (!open) {
            setSearch('');
        }
    }, [open]);
    const sessions = useMemo(() => sessionsQuery.data?.sessions ?? [], [sessionsQuery.data]);
    return (_jsx(DialogPrimitive.Root, { onOpenChange: onOpenChange, open: open, children: _jsxs(DialogPrimitive.Portal, { children: [_jsx(DialogPrimitive.Overlay, { className: "fixed inset-0 z-[200] bg-black/15 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" }), _jsxs(DialogPrimitive.Content, { "aria-describedby": undefined, className: "fixed left-1/2 top-[14vh] z-[210] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-bubble-background) shadow-lg duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 data-[state=open]:zoom-in-95", children: [_jsx(DialogPrimitive.Title, { className: "sr-only", children: t.commandCenter.sections.sessions }), _jsxs(Command, { className: "bg-transparent", loop: true, children: [_jsx(CommandInput, { onValueChange: setSearch, placeholder: t.commandCenter.searchPlaceholder, value: search }), _jsxs(CommandList, { className: "max-h-[min(24rem,60vh)]", children: [_jsx(CommandEmpty, { children: t.commandCenter.noResults }), _jsx(CommandGroup, { className: "**:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-[0.6875rem] **:[[cmdk-group-heading]]:text-muted-foreground/70", heading: t.commandCenter.sections.sessions, children: sessions.map(session => {
                                                const title = sessionTitle(session);
                                                const preview = session.preview?.trim();
                                                return (_jsxs(CommandItem, { className: "gap-2.5", onSelect: () => {
                                                        onResume(session.id);
                                                        onOpenChange(false);
                                                    }, value: `${title} ${preview ?? ''} ${session.id}`, children: [_jsx(MessageCircle, { className: "size-4 shrink-0 text-muted-foreground" }), _jsxs("span", { className: "flex min-w-0 flex-col leading-snug", children: [_jsx("span", { className: "truncate", children: title }), preview ? _jsx("span", { className: "truncate text-xs text-muted-foreground/70", children: preview }) : null] }), _jsx(Check, { className: cn('ml-auto size-4 shrink-0 text-foreground', session.id !== activeStoredSessionId && 'invisible') })] }, session.id));
                                            }) })] })] })] })] }) }));
}
