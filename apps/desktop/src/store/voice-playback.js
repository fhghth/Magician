import { atom } from 'nanostores';
export const $voicePlayback = atom({
    audioElement: null,
    messageId: null,
    sequence: 0,
    source: null,
    status: 'idle'
});
export function setVoicePlaybackState(next) {
    $voicePlayback.set(next);
}
