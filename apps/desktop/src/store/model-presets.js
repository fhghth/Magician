import { atom } from 'nanostores';
import { persistString, storedString } from '@/lib/storage';
import { notifyError } from './notifications';
import { setCurrentFastMode, setCurrentReasoningEffort } from './session';
const STORAGE_KEY = 'hermes.desktop.model-presets';
/** Stable `provider::model` key (matches the visibility-store format). */
export const modelPresetKey = (provider, model) => `${provider}::${model}`;
function load() {
    const raw = storedString(STORAGE_KEY);
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
export const $modelPresets = atom(load());
export function getModelPreset(provider, model) {
    return $modelPresets.get()[modelPresetKey(provider, model)] ?? {};
}
/** Merge a partial preset for one model and persist. */
export function setModelPreset(provider, model, patch) {
    const key = modelPresetKey(provider, model);
    const next = { ...$modelPresets.get(), [key]: { ...$modelPresets.get()[key], ...patch } };
    $modelPresets.set(next);
    persistString(STORAGE_KEY, JSON.stringify(next));
}
/** Push a model's preset onto the active session (optimistic + gateway).
 *  `undefined` skips that dimension; values are capability-gated upstream.
 *  No-ops without a session — the gateway's `config.set` reasoning/fast fall
 *  back to persistent (global/profile) config when none matches, so selecting
 *  a model must not reach it (else it rewrites `agent.*`, defaults included). */
export async function applyModelPreset({ effort, fast }, ctx) {
    if (!ctx.sessionId) {
        return;
    }
    if (effort !== undefined) {
        setCurrentReasoningEffort(effort);
    }
    if (fast !== undefined) {
        setCurrentFastMode(fast);
    }
    try {
        if (effort !== undefined) {
            await ctx.request('config.set', { key: 'reasoning', session_id: ctx.sessionId, value: effort });
        }
        if (fast !== undefined) {
            await ctx.request('config.set', { key: 'fast', session_id: ctx.sessionId, value: fast ? 'fast' : 'normal' });
        }
    }
    catch (err) {
        notifyError(err, ctx.failMessage);
    }
}
