import { Codecs, persistentAtom } from '@/lib/persisted';
const MODE_KEY = 'hermes.desktop.embed-mode';
const ALLOWED_KEY = 'hermes.desktop.embed-allowed';
const modeCodec = {
    decode: raw => (raw === 'always' || raw === 'off' ? raw : 'ask'),
    encode: value => value
};
/** Global default: ask (placeholder), always (auto-load), off (plain link). */
export const $embedMode = persistentAtom(MODE_KEY, 'ask', modeCodec);
/** Providers granted a standing "always allow" (e.g. `youtube`, `twitter`). */
export const $embedAllowed = persistentAtom(ALLOWED_KEY, [], Codecs.stringArray);
export function allowProvider(provider) {
    const current = $embedAllowed.get();
    if (!current.includes(provider)) {
        $embedAllowed.set([...current, provider]);
    }
}
export function setEmbedMode(mode) {
    $embedMode.set(mode);
}
export function clearEmbedAllowed() {
    $embedAllowed.set([]);
}
