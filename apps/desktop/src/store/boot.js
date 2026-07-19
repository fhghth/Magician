import { atom } from 'nanostores';
import { translateNow } from '@/i18n';
const INITIAL_BOOT_STATE = {
    error: null,
    fakeMode: false,
    message: translateNow('boot.steps.startingHermesDesktop'),
    phase: 'renderer.init',
    progress: 2,
    running: true,
    timestamp: Date.now(),
    visible: true
};
export const $desktopBoot = atom(INITIAL_BOOT_STATE);
function clampProgress(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
}
export function applyDesktopBootProgress(progress) {
    const current = $desktopBoot.get();
    const nextProgress = clampProgress(progress.progress);
    const mergedProgress = progress.running ? Math.max(current.progress, nextProgress) : nextProgress;
    $desktopBoot.set({
        ...current,
        ...progress,
        error: progress.error ?? null,
        progress: mergedProgress,
        visible: progress.running || mergedProgress < 100 || Boolean(progress.error)
    });
}
export function setDesktopBootStep(step) {
    const current = $desktopBoot.get();
    applyDesktopBootProgress({
        error: step.error ?? null,
        fakeMode: step.fakeMode ?? current.fakeMode,
        message: step.message,
        phase: step.phase,
        progress: step.progress,
        running: step.running ?? true,
        timestamp: Date.now()
    });
}
export function completeDesktopBoot(message = translateNow('boot.ready')) {
    const current = $desktopBoot.get();
    $desktopBoot.set({
        ...current,
        error: null,
        message,
        phase: 'renderer.ready',
        progress: 100,
        running: false,
        timestamp: Date.now(),
        visible: false
    });
}
export function failDesktopBoot(message) {
    const current = $desktopBoot.get();
    $desktopBoot.set({
        ...current,
        error: message,
        message: translateNow('boot.desktopBootFailedWithMessage', message),
        phase: 'renderer.error',
        progress: clampProgress(current.progress),
        running: false,
        timestamp: Date.now(),
        visible: true
    });
}
