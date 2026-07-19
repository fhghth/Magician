import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { messageContentText } from '@/components/assistant-ui/thread/content';
import { Codicon } from '@/components/ui/codicon';
import { LinkifiedText } from '@/lib/external-link';
import { cn } from '@/lib/utils';
const SLASH_STATUS_RE = /^slash:(?<command>\/[^\n]+)\n(?<output>[\s\S]*)$/;
const STEER_NOTE_RE = /^steer:(?<text>[\s\S]+)$/;
export const SystemMessage = () => {
    const text = useAuiState(s => messageContentText(s.message.content));
    if (!text) {
        return null;
    }
    const steerNote = text.match(STEER_NOTE_RE);
    if (steerNote?.groups) {
        return (_jsxs(MessagePrimitive.Root, { className: "flex max-w-[min(86%,44rem)] items-center gap-1.5 self-center px-2 py-0.5 text-[0.6875rem] leading-5 text-muted-foreground/60", "data-role": "system", "data-slot": "aui_system-message-root", children: [_jsx(Codicon, { className: "text-muted-foreground/55", name: "compass", size: "0.75rem" }), _jsx("span", { className: "text-muted-foreground/55", children: "steered" }), _jsx("span", { className: "text-muted-foreground/35", children: "\u00B7" }), _jsx("span", { className: "whitespace-pre-wrap", children: steerNote.groups.text.trim() })] }));
    }
    const slashStatus = text.match(SLASH_STATUS_RE);
    if (slashStatus?.groups) {
        const output = slashStatus.groups.output.trim();
        // Single-line status (e.g. "model → x") reads best centered inline; padded
        // multiline output (catalogs, usage tables) needs left-aligned, wider room
        // or the column alignment breaks.
        const multiline = output.includes('\n');
        return (_jsxs(MessagePrimitive.Root, { className: cn('w-[60%] max-w-[44rem] self-center px-2 py-0.5 text-[0.6875rem] leading-5 text-muted-foreground/60', multiline ? 'text-left' : 'text-center'), "data-role": "system", "data-slot": "aui_system-message-root", children: [_jsx("span", { className: "font-mono text-muted-foreground/55", children: slashStatus.groups.command }), multiline ? (_jsx(LinkifiedText, { className: "mt-0.5 block whitespace-pre-wrap", explicitOnly: true, pretty: false, text: output })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "mx-1.5 text-muted-foreground/35", children: "\u00B7" }), _jsx(LinkifiedText, { className: "whitespace-pre-wrap", explicitOnly: true, pretty: false, text: output })] }))] }));
    }
    const multiline = text.includes('\n');
    return (_jsx(MessagePrimitive.Root, { className: cn('w-[60%] max-w-[44rem] self-center px-2 py-0.5 text-[0.6875rem] leading-5 text-muted-foreground/55', multiline ? 'text-left' : 'text-center'), "data-role": "system", "data-slot": "aui_system-message-root", children: _jsx(LinkifiedText, { className: "whitespace-pre-wrap", explicitOnly: true, pretty: false, text: text }) }));
};
