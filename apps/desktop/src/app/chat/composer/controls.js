import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { Codicon } from '@/components/ui/codicon';
import { KbdCombo } from '@/components/ui/kbd';
import { Tip } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { AudioLines, iconSize, Layers3, Loader2, Square, SteeringWheel, Volume2, VolumeX } from '@/lib/icons';
import { formatCombo } from '@/lib/keybinds/combo';
import { cn } from '@/lib/utils';
import { ModelPill } from './model-pill';
export const ICON_BTN = 'size-(--composer-control-size) shrink-0 rounded-md';
export const GHOST_ICON_BTN = cn(ICON_BTN, 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground');
// Send/voice-conversation primary: solid foreground-on-background circle
// (reads as black-on-white in light mode, white-on-black in dark mode) to
// match the reference composer's high-contrast CTA. Keeps the pill itself
// neutral and lets the action visually dominate the row.
export const PRIMARY_ICON_BTN = cn('size-(--composer-control-primary-size,var(--composer-control-size)) shrink-0 rounded-full p-0', 'bg-foreground text-background hover:bg-foreground/90', 'disabled:bg-foreground/30 disabled:text-background disabled:opacity-100');
export function ComposerControls({ autoSpeak, busy, busyAction, canSteer, canSubmit, compactModelPill = false, conversation, disabled, hasComposerPayload, state, voiceStatus, onDictate, onSteer, onToggleAutoSpeak }) {
    const { t } = useI18n();
    const c = t.composer;
    const steerCombo = formatCombo('mod+enter');
    const steerLabel = `${c.steer} (${steerCombo})`;
    const steerTip = (_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [c.steer, _jsx(KbdCombo, { combo: "mod+enter", size: "sm", variant: "inverted" })] }));
    if (conversation.active) {
        return _jsx(ConversationPill, { ...conversation, disabled: disabled });
    }
    const showVoicePrimary = !busy && !hasComposerPayload;
    return (_jsxs("div", { className: "ml-auto flex shrink-0 items-center gap-(--composer-control-gap)", children: [_jsx(ModelPill, { compact: compactModelPill, disabled: disabled, model: state.model }), canSteer ? (_jsx(Tip, { label: steerTip, children: _jsx(Button, { "aria-label": steerLabel, className: GHOST_ICON_BTN, disabled: disabled, onClick: onSteer, size: "icon", type: "button", variant: "ghost", children: _jsx(SteeringWheel, { className: iconSize.sm }) }) })) : (_jsx(DictationButton, { disabled: disabled, onToggle: onDictate, state: state.voice, status: voiceStatus })), _jsx(AutoSpeakButton, { active: autoSpeak, disabled: disabled, onToggle: onToggleAutoSpeak }), showVoicePrimary ? (_jsx(Tip, { label: c.startVoice, children: _jsx(Button, { "aria-label": c.startVoice, className: PRIMARY_ICON_BTN, disabled: disabled, onClick: () => {
                        triggerHaptic('open');
                        conversation.onStart();
                    }, size: "icon", type: "button", children: _jsx(AudioLines, { className: iconSize.sm }) }) })) : (_jsx(Tip, { label: busy ? (busyAction === 'queue' ? c.queueMessage : c.stop) : c.send, children: _jsx(Button, { "aria-label": busy ? (busyAction === 'queue' ? c.queueMessage : c.stop) : c.send, className: PRIMARY_ICON_BTN, disabled: disabled || !canSubmit, type: "submit", children: busy ? (busyAction === 'queue' ? (_jsx(Layers3, { className: iconSize.sm })) : (_jsx("span", { className: "block size-2.5 rounded-[0.1875rem] bg-current" }))) : (_jsx(Codicon, { name: "arrow-up", size: "0.875rem" })) }) }))] }));
}
function ConversationPill({ disabled, level, muted, onEnd, onStopTurn, onToggleMute, status }) {
    const { t } = useI18n();
    const c = t.composer;
    const speaking = status === 'speaking';
    const listening = status === 'listening' && !muted;
    const label = status === 'speaking'
        ? c.speaking
        : status === 'transcribing'
            ? c.transcribing
            : status === 'thinking'
                ? c.thinking
                : muted
                    ? c.muted
                    : c.listening;
    return (_jsxs("div", { className: "ml-auto flex shrink-0 items-center gap-(--composer-control-gap)", children: [_jsx(Tip, { label: muted ? c.unmuteMic : c.muteMic, children: _jsx(Button, { "aria-label": muted ? c.unmuteMic : c.muteMic, "aria-pressed": muted, className: cn(GHOST_ICON_BTN, 'p-0', muted && 'bg-muted text-muted-foreground'), disabled: disabled, onClick: () => {
                        triggerHaptic('selection');
                        onToggleMute();
                    }, size: "icon", type: "button", variant: "ghost", children: _jsx(Codicon, { name: muted ? 'mic-off' : 'mic', size: "1rem" }) }) }), listening && (_jsxs(Button, { "aria-label": c.stopListening, className: "h-(--composer-control-size) shrink-0 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground", disabled: disabled, onClick: () => {
                    triggerHaptic('submit');
                    onStopTurn();
                }, title: c.stopListening, type: "button", variant: "ghost", children: [_jsx(Square, { className: cn('fill-current', iconSize.xs) }), _jsx("span", { children: c.stopShort })] })), _jsxs(Button, { "aria-label": c.endConversation, className: "h-(--composer-control-size) gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90", disabled: disabled, onClick: () => {
                    triggerHaptic('close');
                    onEnd();
                }, title: c.endConversation, type: "button", children: [_jsx(ConversationIndicator, { level: level, listening: listening, speaking: speaking }), _jsx("span", { children: c.endShort })] }), _jsx("span", { className: "sr-only", role: "status", children: label })] }));
}
function ConversationIndicator({ level, listening, speaking }) {
    if (speaking) {
        return _jsx(Loader2, { className: cn('animate-spin', iconSize.xs) });
    }
    const bars = [0.55, 0.85, 1, 0.85, 0.55];
    const normalized = Math.max(0, Math.min(level, 1));
    return (_jsx("span", { "aria-hidden": "true", className: "flex h-3 items-center gap-0.5", children: bars.map((weight, index) => {
            const height = listening ? 0.3 + Math.min(0.7, normalized * weight) : 0.3;
            return _jsx("span", { className: "w-0.5 rounded-full bg-current", style: { height: `${height * 100}%` } }, index);
        }) }));
}
// Pure-TTS toggle: type normally, but have every assistant reply read aloud —
// no dictation, no full conversation loop. Filled/accent when on, mirroring the
// muted-mic pressed state above. Driven by (and persisted to) `voice.auto_tts`.
function AutoSpeakButton({ active, disabled, onToggle }) {
    const { t } = useI18n();
    const c = t.composer;
    const label = active ? c.stopSpeakingReplies : c.speakReplies;
    return (_jsx(Tip, { label: label, children: _jsx(Button, { "aria-label": label, "aria-pressed": active, className: cn(GHOST_ICON_BTN, 'p-0', active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'), disabled: disabled, onClick: () => {
                triggerHaptic(active ? 'close' : 'open');
                onToggle();
            }, size: "icon", type: "button", variant: "ghost", children: active ? _jsx(Volume2, { className: iconSize.sm }) : _jsx(VolumeX, { className: iconSize.sm }) }) }));
}
function DictationButton({ disabled, state, status, onToggle }) {
    const { t } = useI18n();
    const c = t.composer;
    const active = state.active || status !== 'idle';
    const aria = status === 'recording' ? c.stopDictation : status === 'transcribing' ? c.transcribingDictation : c.voiceDictation;
    return (_jsx(Tip, { label: aria, children: _jsx(Button, { "aria-label": aria, "aria-pressed": active, className: cn(GHOST_ICON_BTN, 'p-0', 'data-[active=true]:bg-accent data-[active=true]:text-foreground', status === 'recording' && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary', status === 'transcribing' && 'bg-primary/10 text-primary'), "data-active": active, disabled: disabled || !state.enabled || status === 'transcribing', onClick: () => {
                triggerHaptic(active ? 'close' : 'open');
                onToggle();
            }, size: "icon", type: "button", variant: "ghost", children: status === 'recording' ? (_jsx(Square, { className: cn('fill-current', iconSize.xs) })) : status === 'transcribing' ? (_jsx(Loader2, { className: cn('animate-spin', iconSize.sm) })) : (_jsx(Codicon, { name: "mic", size: "0.875rem" })) }) }));
}
