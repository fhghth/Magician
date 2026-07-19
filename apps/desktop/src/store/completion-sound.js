import { atom } from 'nanostores';
import { persistString, storedString } from '@/lib/storage';
const STORAGE_KEY = 'hermes.desktop.completionSoundVariantId';
export const DEFAULT_COMPLETION_SOUND_VARIANT_ID = 1;
// Range mirrors COMPLETION_SOUND_VARIANTS in lib/completion-sound.ts. Validating
// by range (not membership) keeps this store free of a dependency on the lib,
// which imports the atom back — a membership check would close that cycle.
const VARIANT_COUNT = 14;
export function resolveCompletionSoundVariantId(variantId) {
    return Number.isInteger(variantId) && variantId >= 1 && variantId <= VARIANT_COUNT
        ? variantId
        : DEFAULT_COMPLETION_SOUND_VARIANT_ID;
}
function load() {
    const stored = storedString(STORAGE_KEY);
    return stored ? resolveCompletionSoundVariantId(Number.parseInt(stored, 10)) : DEFAULT_COMPLETION_SOUND_VARIANT_ID;
}
export const $completionSoundVariantId = atom(load());
$completionSoundVariantId.subscribe(id => persistString(STORAGE_KEY, String(id)));
export function setCompletionSoundVariantId(variantId) {
    $completionSoundVariantId.set(resolveCompletionSoundVariantId(variantId));
}
