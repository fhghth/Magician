import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { translateNow, useI18n } from '@/i18n';
import { ChevronDown, ExternalLink, Loader2, Save, Trash2 } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { CONTROL_TEXT } from './constants';
import { prettyName, withoutKey } from './helpers';
import { ListRow } from './primitives';
/** Matches Advanced / config field controls (ListRow + Input). */
export const CREDENTIAL_CONTROL_CLASS = cn('h-8', CONTROL_TEXT);
// Resting credential field: chrome stripped so it reads as plain subtext.
// Stacked (<@2xl) it collapses to zero box (flush under its label); at @2xl it
// keeps the full control metrics (h-8 + px-2.5/py-1.5) so it centres on the
// label and nothing shifts when focus/expand adds the border. `!` beats the
// unlayered chrome CSS and the shared control sizing.
const CRED_BARE = 'border-0! bg-transparent! shadow-none! h-auto! p-0! @2xl:h-8! @2xl:px-2.5! @2xl:py-1.5!';
export const isKeyVar = (key, info) => info.is_password || /(?:_API_KEY|_TOKEN|_KEY)$/.test(key);
export const friendlyFieldLabel = (key, info) => info.description?.trim() ||
    key
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
export const credentialPlaceholder = (key, info, label) => isKeyVar(key, info)
    ? translateNow('settings.credentials.pasteLabelKey', label)
    : /URL$/i.test(key)
        ? 'https://…'
        : translateNow('settings.credentials.optional');
// A single credential field: a set key shows as a filled read-only input
// (redacted value) that edits in place on click. Save appears once typed; a set
// key also offers Remove, and Esc cancels without closing the overlay.
export function KeyField({ expanded = false, info, placeholder, rowProps, varKey }) {
    const { t } = useI18n();
    const { edits, onClear, onSave, saving, setEdits } = rowProps;
    const editing = edits[varKey] !== undefined;
    // Bare (plain subtext) only while the group is collapsed and idle. Expanding
    // the card counts as "focused in", so it gets full input chrome too.
    const bare = !editing && !expanded;
    const draft = edits[varKey] ?? '';
    const dirty = draft.trim().length > 0;
    const busy = saving === varKey;
    const masked = info.redacted_value ?? '••••••••';
    const startEdit = () => setEdits(c => ({ ...c, [varKey]: '' }));
    const cancel = () => setEdits(c => withoutKey(c, varKey));
    const update = (e) => setEdits(c => ({ ...c, [varKey]: e.target.value }));
    const keydown = (e) => {
        if (e.key === 'Enter' && dirty) {
            void onSave(varKey);
        }
        else if (e.key === 'Escape' && editing) {
            e.preventDefault();
            e.stopPropagation();
            cancel();
        }
    };
    const editType = info.is_password ? 'password' : 'text';
    if (info.is_set && !editing) {
        return (_jsx(Input, { className: cn(CREDENTIAL_CONTROL_CLASS, bare && CRED_BARE, 'cursor-pointer text-muted-foreground'), onFocus: startEdit, readOnly: true, value: masked }));
    }
    return (_jsxs("div", { className: "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2", children: [_jsx(Input, { autoFocus: editing, className: cn(CREDENTIAL_CONTROL_CLASS, bare && CRED_BARE), onChange: update, onFocus: () => {
                    if (!editing) {
                        startEdit();
                    }
                }, onKeyDown: keydown, placeholder: placeholder ?? t.settings.credentials.pasteKey, type: editType, value: draft }), editing && (info.is_set || dirty) && (_jsxs("div", { className: "flex items-center gap-1", children: [info.is_set && (_jsx(Button, { "aria-label": t.settings.credentials.remove, className: "text-muted-foreground hover:text-destructive", disabled: busy, onClick: () => void onClear(varKey), size: "icon-xs", title: t.settings.credentials.remove, type: "button", variant: "ghost", children: _jsx(Trash2, {}) })), dirty && (_jsxs(Button, { className: "h-8", disabled: busy, onClick: () => void onSave(varKey), size: "sm", children: [busy ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(Save, {}), busy ? t.settings.credentials.saving : t.common.save] }))] }))] }));
}
function CredentialDocsLink({ href }) {
    const { t } = useI18n();
    return (_jsxs("a", { className: "inline-flex w-fit items-center gap-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) underline-offset-4 transition-colors hover:text-foreground hover:underline", href: href, onClick: e => e.stopPropagation(), rel: "noreferrer", target: "_blank", children: [t.settings.credentials.getKey, _jsx(ExternalLink, { className: "size-3" })] }));
}
/** One credential row — collapsible; description and docs link expand on click. */
export function CredentialKeyCard({ expanded, info, label, onExpand, onToggle, placeholder, rowProps, varKey }) {
    const docsUrl = info.url?.trim();
    const description = info.description?.trim();
    const expandable = Boolean(description || docsUrl);
    return (_jsx("div", { className: cn('@container group/card rounded-[6px] p-3 transition-colors', expandable && 'cursor-pointer', expandable && !expanded && 'row-hover', expanded && 'bg-(--ui-bg-quaternary) ring-1 ring-(--ui-stroke-secondary)'), onClick: expandable ? onToggle : undefined, onKeyDown: expandable
            ? e => {
                // Only the card's own focus toggles it — ignore Enter/Space
                // bubbling up from the inputs/buttons inside (Enter saves a key,
                // Space types a space) so keyboard editing never collapses the card.
                if (e.target !== e.currentTarget) {
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                }
            }
            : undefined, role: expandable ? 'button' : undefined, tabIndex: expandable ? 0 : undefined, children: _jsxs("div", { className: "grid grid-cols-1 items-start gap-x-3 gap-y-1.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] @2xl:gap-y-3", children: [_jsxs("div", { className: "flex h-8 min-w-0 items-center gap-2", children: [_jsx("span", { className: cn('size-2 shrink-0 rounded-full', info.is_set ? 'bg-primary' : 'bg-(--ui-stroke-secondary)') }), _jsx("span", { className: "min-w-0 truncate text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: label }), expandable && (_jsx(ChevronDown, { className: cn('size-3.5 shrink-0 text-muted-foreground transition', expanded ? 'rotate-180 opacity-100' : 'opacity-0 group-hover/card:opacity-100') }))] }), _jsx("div", { className: "min-w-0", onClick: e => e.stopPropagation(), onFocus: () => {
                        if (expandable && !expanded) {
                            onExpand();
                        }
                    }, children: _jsx(KeyField, { expanded: expanded, info: info, placeholder: placeholder, rowProps: rowProps, varKey: varKey }) }), expandable && expanded && (_jsxs("div", { className: "grid gap-3 @2xl:col-span-2", onClick: e => e.stopPropagation(), children: [description && (_jsx("p", { className: "text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: description })), docsUrl && _jsx(CredentialDocsLink, { href: docsUrl })] }))] }) }));
}
/** Provider API key group — collapsible card; description, docs link, and advanced fields expand on click. */
export function ProviderKeyRows({ expanded, group, onExpand, onToggle, rowProps }) {
    const { t } = useI18n();
    const docsUrl = group.docsUrl?.trim();
    const description = group.description?.trim();
    const expandable = Boolean(description || docsUrl || group.advanced.length > 0);
    return (_jsx("div", { className: cn('@container group/card rounded-[6px] p-3 transition-colors', expandable && 'cursor-pointer', expandable && !expanded && 'row-hover', expanded && 'bg-(--ui-bg-quaternary) ring-1 ring-(--ui-stroke-secondary)'), onClick: expandable ? onToggle : undefined, onKeyDown: expandable
            ? e => {
                // Only the card's own focus toggles it — ignore Enter/Space
                // bubbling up from the inputs/buttons inside (Enter saves a key,
                // Space types a space) so keyboard editing never collapses the card.
                if (e.target !== e.currentTarget) {
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                }
            }
            : undefined, role: expandable ? 'button' : undefined, tabIndex: expandable ? 0 : undefined, children: _jsxs("div", { className: "grid grid-cols-1 items-start gap-x-3 gap-y-1.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] @2xl:gap-y-3", children: [_jsxs("div", { className: "flex h-8 min-w-0 items-center gap-2", children: [_jsx("span", { className: cn('size-2 shrink-0 rounded-full', group.hasAnySet ? 'bg-primary' : 'bg-(--ui-stroke-secondary)') }), _jsx("span", { className: "min-w-0 truncate text-[length:var(--conversation-text-font-size)] font-medium text-foreground", children: group.name }), expandable && (_jsx(ChevronDown, { className: cn('size-3.5 shrink-0 text-muted-foreground transition', expanded ? 'rotate-180 opacity-100' : 'opacity-0 group-hover/card:opacity-100') }))] }), _jsx("div", { className: "min-w-0", onClick: e => e.stopPropagation(), onFocus: () => {
                        if (expandable && !expanded) {
                            onExpand();
                        }
                    }, children: _jsx(KeyField, { expanded: expanded, info: group.primary[1], placeholder: t.settings.credentials.pasteLabelKey(group.name), rowProps: rowProps, varKey: group.primary[0] }) }), expandable && expanded && (_jsxs("div", { className: "grid gap-3 @2xl:col-span-2", onClick: e => e.stopPropagation(), children: [description && (_jsx("p", { className: "text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)", children: description })), group.advanced.map(([key, info]) => {
                            const fieldLabel = isKeyVar(key, info)
                                ? prettyName(key.replace(/(?:_API_KEY|_TOKEN|_KEY)$/i, ''))
                                : friendlyFieldLabel(key, info);
                            return (_jsx(ListRow, { action: _jsx(KeyField, { expanded: expanded, info: info, placeholder: credentialPlaceholder(key, info, fieldLabel), rowProps: rowProps, varKey: key }), title: fieldLabel }, key));
                        }), docsUrl && _jsx(CredentialDocsLink, { href: docsUrl })] }))] }) }));
}
export function credentialRowLabel(varKey, info) {
    if (isKeyVar(varKey, info)) {
        return prettyName(varKey.replace(/(?:_API_KEY|_TOKEN|_KEY)$/i, ''));
    }
    return prettyName(varKey);
}
