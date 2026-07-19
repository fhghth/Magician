import { atom } from 'nanostores';
import { previewName } from '@/lib/preview-targets';
const MAX_PER_SESSION = 4;
export const $previewStatusBySession = atom({});
const writePreviews = (sid, items) => {
    const current = $previewStatusBySession.get();
    if (items.length === 0) {
        if (!current[sid]) {
            return;
        }
        const next = { ...current };
        delete next[sid];
        $previewStatusBySession.set(next);
        return;
    }
    $previewStatusBySession.set({ ...current, [sid]: items });
};
/**
 * Record a detected artifact, newest last, capped. Idempotent: a target already
 * in the list keeps its slot (the tool row re-registers on every render, so this
 * must not churn the atom or reorder rows).
 */
export function recordPreviewArtifact(sid, target, cwd) {
    const raw = target.trim();
    if (!sid || !raw) {
        return;
    }
    const list = $previewStatusBySession.get()[sid] ?? [];
    if (list.some(item => item.id === raw)) {
        return;
    }
    writePreviews(sid, [...list, { cwd, id: raw, label: previewName(raw), target: raw }].slice(-MAX_PER_SESSION));
}
export function dismissPreviewArtifact(sid, id) {
    const list = $previewStatusBySession.get()[sid];
    if (list) {
        writePreviews(sid, list.filter(item => item.id !== id));
    }
}
export function clearPreviewArtifacts(sid) {
    writePreviews(sid, []);
}
