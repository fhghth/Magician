import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
import { CodeEditor } from '@/components/chat/code-editor';
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
// Kept a string (not a shared CSS utility): the `size-5` prefix lets
// tailwind-merge override <Button size="icon">'s larger built-in size.
const ICON_BUTTON = 'size-5 cursor-pointer rounded-[4px] text-muted-foreground/70 hover:bg-(--ui-control-active-background) hover:text-foreground';
/** In-memory JSON editor — not for on-disk file previews in the right rail. */
export function JsonDocumentEditor({ apiRef, className, disabled, filePath = 'document.json', header, highlight, initialValue, onChange, onCursorChange, onFormatJsonError, onSave, remountKey, trailing }) {
    const { t } = useI18n();
    const localApi = useRef(null);
    const editorApi = apiRef ?? localApi;
    return (_jsxs("div", { className: cn('flex min-h-0 flex-1 flex-col overflow-hidden', className), children: [_jsxs("div", { className: "flex h-8 shrink-0 items-center gap-2 px-3", children: [header ? (_jsx("span", { className: "flex min-w-0 items-center gap-1.5 text-[0.68rem] text-(--ui-text-tertiary)", children: header })) : null, _jsxs("div", { className: "ml-auto flex items-center gap-1", children: [_jsx(Tip, { label: t.common.formatJson, children: _jsx(Button, { "aria-label": t.common.formatJson, className: ICON_BUTTON, disabled: disabled, onClick: () => {
                                        const result = editorApi.current?.formatJson();
                                        if (result && !result.ok) {
                                            onFormatJsonError(result.error);
                                        }
                                    }, size: "icon", variant: "ghost", children: _jsx(Codicon, { name: "json", size: "0.8125rem" }) }) }), trailing] })] }), _jsx("div", { className: "min-h-0 flex-1", children: _jsx(CodeEditor, { apiRef: editorApi, disabled: disabled, filePath: filePath, formatJson: true, highlight: highlight, initialValue: initialValue, onChange: onChange, onCursorChange: onCursorChange, onFormatJsonError: onFormatJsonError, onSave: onSave }, remountKey) })] }));
}
