import { atom, computed } from 'nanostores';
const DEFAULT_CONSOLE_HEIGHT = 240;
function updateAtom(store, next) {
    store.set(typeof next === 'function' ? next(store.get()) : next);
}
export function createPreviewConsoleState() {
    const $height = atom(DEFAULT_CONSOLE_HEIGHT);
    const $logs = atom([]);
    const $logCount = computed($logs, logs => logs.length);
    const $open = atom(false);
    const $selectedLogIds = atom(new Set());
    let nextLogId = 0;
    return {
        $height,
        $logCount,
        $logs,
        $open,
        $selectedLogIds,
        append(entry) {
            $logs.set([...$logs.get().slice(-199), { ...entry, id: ++nextLogId }]);
        },
        clear() {
            $logs.set([]);
            $selectedLogIds.set(new Set());
        },
        clearSelection() {
            if ($selectedLogIds.get().size === 0) {
                return;
            }
            $selectedLogIds.set(new Set());
        },
        reset() {
            nextLogId = 0;
            $logs.set([]);
            $selectedLogIds.set(new Set());
        },
        setHeight(next) {
            updateAtom($height, next);
        },
        setOpen(next) {
            updateAtom($open, next);
        },
        toggleSelection(id) {
            const next = new Set($selectedLogIds.get());
            if (!next.delete(id)) {
                next.add(id);
            }
            $selectedLogIds.set(next);
        }
    };
}
