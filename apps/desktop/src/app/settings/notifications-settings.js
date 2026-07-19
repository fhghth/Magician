import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import { COMPLETION_SOUND_VARIANTS, previewCompletionSound } from '@/lib/completion-sound';
import { triggerHaptic } from '@/lib/haptics';
import { Bell, Play } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { $completionSoundVariantId, setCompletionSoundVariantId } from '@/store/completion-sound';
import { $nativeNotifyPrefs, NATIVE_NOTIFICATION_KINDS, sendTestNativeNotification, setNativeNotifyEnabled, setNativeNotifyKind } from '@/store/native-notifications';
import { notify } from '@/store/notifications';
import { CONTROL_TEXT } from './constants';
import { ListRow, SectionHeading, SettingsContent } from './primitives';
const CAPTION = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)';
function Caption({ children, className }) {
    return _jsx("p", { className: cn(CAPTION, className), children: children });
}
function ToggleRow(props) {
    return (_jsx(ListRow, { action: _jsx(Switch, { "aria-label": props.label, checked: props.checked, disabled: props.disabled, onCheckedChange: on => {
                triggerHaptic('selection');
                props.onChange(on);
            } }), description: props.description, title: props.label }));
}
export function NotificationsSettings() {
    const { t } = useI18n();
    const prefs = useStore($nativeNotifyPrefs);
    const completionSoundVariantId = useStore($completionSoundVariantId);
    const copy = t.settings.notifications;
    const runTest = async () => {
        triggerHaptic('open');
        const ok = await sendTestNativeNotification(copy.testTitle, copy.testBody);
        notify({ kind: ok ? 'info' : 'error', message: ok ? copy.testSent : copy.testUnsupported });
    };
    return (_jsxs(SettingsContent, { children: [_jsx(SectionHeading, { icon: Bell, title: copy.title }), _jsx(Caption, { className: "mb-2 leading-(--conversation-caption-line-height)", children: copy.intro }), _jsx(ToggleRow, { checked: prefs.enabled, description: copy.enableAllDesc, label: copy.enableAll, onChange: setNativeNotifyEnabled }), NATIVE_NOTIFICATION_KINDS.map(kind => (_jsx(ToggleRow, { checked: prefs.enabled && prefs.kinds[kind], description: copy.kinds[kind].description, disabled: !prefs.enabled, label: copy.kinds[kind].label, onChange: on => setNativeNotifyKind(kind, on) }, kind))), _jsx(ListRow, { action: _jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [_jsxs(Select, { onValueChange: value => {
                                const variantId = Number.parseInt(value, 10);
                                setCompletionSoundVariantId(variantId);
                                previewCompletionSound(variantId);
                                triggerHaptic('selection');
                            }, value: String(completionSoundVariantId), children: [_jsx(SelectTrigger, { className: cn('min-w-56', CONTROL_TEXT), children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: COMPLETION_SOUND_VARIANTS.map(variant => (_jsx(SelectItem, { value: String(variant.id), children: variant.name }, variant.id))) })] }), _jsxs(Button, { className: "gap-1.5", onClick: () => {
                                previewCompletionSound();
                                triggerHaptic('crisp');
                            }, size: "sm", type: "button", variant: "outline", children: [_jsx(Play, { className: "size-3.5" }), copy.completionSoundPreview] })] }), description: copy.completionSoundDesc, title: copy.completionSoundTitle }), _jsxs("div", { className: "mt-4 flex flex-col gap-2", children: [_jsxs(Button, { className: "self-start", onClick: () => void runTest(), size: "sm", type: "button", variant: "outline", children: [_jsx(Bell, {}), copy.test] }), _jsx(Caption, { children: copy.focusedHint })] })] }));
}
