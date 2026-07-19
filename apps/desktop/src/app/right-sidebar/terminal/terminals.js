import { atom, computed } from 'nanostores';
import { readKey, writeKey } from '@/lib/storage';
import { $currentCwd } from '@/store/session';
import { setTerminalTakeover } from '../store';
import { seedAgentTerminalCommand } from './agent-terminal-stream';
const TERMINALS_STORAGE_KEY = 'hermes.desktop.terminals.v1';
// Cap a single tab's replayed history so the persisted layout can't blow the
// localStorage quota. Roughly mirrors VS Code's persistentSessionScrollback
// default (100 lines) once the serialized escape codes are counted in.
const MAX_REVIVE_BUFFER_CHARS = 48_000;
function sanitizePersistedTerminal(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const cwd = typeof record.cwd === 'string' ? record.cwd : '';
    const reviveBuffer = typeof record.reviveBuffer === 'string' ? record.reviveBuffer : undefined;
    if (!id) {
        return null;
    }
    return {
        auto: typeof record.auto === 'boolean' ? record.auto : true,
        cwd,
        id,
        ...(reviveBuffer ? { reviveBuffer } : {}),
        title: title || 'Terminal'
    };
}
function loadPersistedTerminals() {
    const fallback = { activeTerminalId: null, terminals: [] };
    const raw = readKey(TERMINALS_STORAGE_KEY);
    if (!raw) {
        return fallback;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return fallback;
        }
        const record = parsed;
        const terminals = Array.isArray(record.terminals)
            ? record.terminals.map(sanitizePersistedTerminal).filter((term) => Boolean(term))
            : [];
        const active = typeof record.activeTerminalId === 'string' && terminals.some(term => term.id === record.activeTerminalId)
            ? record.activeTerminalId
            : (terminals[0]?.id ?? null);
        return { activeTerminalId: active, terminals };
    }
    catch {
        return fallback;
    }
}
// Persist synchronously on every change (the app-wide convention — see panes.ts
// / layout.ts). Capturing history this way means a snapshot is already on disk
// well before the renderer tears down, so app quit needs no unload hook.
function persistTerminals(list, activeTerminalId) {
    const terminals = list
        .filter(term => term.kind === 'user')
        .map(term => ({
        auto: term.auto,
        cwd: term.cwd,
        id: term.id,
        ...(term.reviveBuffer ? { reviveBuffer: term.reviveBuffer } : {}),
        title: term.title
    }));
    if (!terminals.length) {
        writeKey(TERMINALS_STORAGE_KEY, null);
        return;
    }
    const active = terminals.some(term => term.id === activeTerminalId) ? activeTerminalId : (terminals[0]?.id ?? null);
    writeKey(TERMINALS_STORAGE_KEY, JSON.stringify({ activeTerminalId: active, terminals }));
}
const restored = loadPersistedTerminals();
export const $terminals = atom(restored.terminals.map(term => ({ ...term, kind: 'user' })));
export const $activeTerminalId = atom(restored.activeTerminalId);
$terminals.subscribe(list => persistTerminals(list, $activeTerminalId.get()));
$activeTerminalId.subscribe(active => persistTerminals($terminals.get(), active));
export const $activeTerminal = computed([$terminals, $activeTerminalId], (list, id) => list.find(term => term.id === id) ?? null);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
/** Append a fresh terminal and focus it. Captures the current cwd once (its only
 *  tie to session/project state); pass an explicit cwd to override. Returns the id. */
export function createTerminal(cwd = $currentCwd.get()) {
    const id = newId();
    $terminals.set([...$terminals.get(), { id, title: 'Terminal', auto: true, cwd, kind: 'user' }]);
    $activeTerminalId.set(id);
    return id;
}
// Procs we've already surfaced a tab for — so closing an agent tab doesn't
// resurrect it on the next poll while the process is still running.
const surfacedProcs = new Set();
const findByProc = (procId) => $terminals.get().find(term => term.procId === procId);
/** Auto-surface an agent background process as a read-only tab — once. Returns
 *  the tab id, or null if it was already surfaced and the user has since closed it. */
export function ensureAgentTerminal(procId, title) {
    const existing = findByProc(procId);
    if (existing) {
        return existing.id;
    }
    if (surfacedProcs.has(procId)) {
        return null;
    }
    surfacedProcs.add(procId);
    const id = newId();
    $terminals.set([...$terminals.get(), { id, title: title || 'agent', auto: false, cwd: '', kind: 'agent', procId }]);
    return id;
}
/** Open + focus an agent process's tab (the status-stack link), recreating it if
 *  the user had closed it. Opens the pane. */
export function openAgentTerminal(procId, title) {
    surfacedProcs.add(procId);
    seedAgentTerminalCommand(procId, title);
    let id = findByProc(procId)?.id;
    if (!id) {
        id = newId();
        $terminals.set([...$terminals.get(), { id, title: title || 'agent', auto: false, cwd: '', kind: 'agent', procId }]);
    }
    $activeTerminalId.set(id);
    setTerminalTakeover(true);
}
/** Guarantee at least one tab exists when the pane opens.
 *  If a status-stack click already opened an agent tab, don't create a
 *  second, unrelated user shell just because the pane became visible. */
export function ensureTerminal() {
    if ($terminals.get().length === 0) {
        createTerminal();
    }
}
export function selectTerminal(id) {
    if ($terminals.get().some(term => term.id === id)) {
        $activeTerminalId.set(id);
    }
}
/** Move the active tab by `direction` (+1 next / -1 prev), wrapping around. */
export function cycleTerminal(direction) {
    const list = $terminals.get();
    if (list.length < 2) {
        return;
    }
    const current = Math.max(0, list.findIndex(term => term.id === $activeTerminalId.get()));
    $activeTerminalId.set(list[(current + direction + list.length) % list.length].id);
}
/** Drop a terminal. Focus slides to the neighbor that fills its slot; closing
 *  the last one closes the whole pane. */
export function closeTerminal(id) {
    const list = $terminals.get();
    const index = list.findIndex(term => term.id === id);
    if (index < 0) {
        return;
    }
    const next = list.filter(term => term.id !== id);
    $terminals.set(next);
    if ($activeTerminalId.get() === id) {
        $activeTerminalId.set((next[index] ?? next[index - 1])?.id ?? null);
    }
    if (!next.length) {
        setTerminalTakeover(false);
    }
}
/** Close the read-only agent tab mirroring a background process. The agent
 *  drives this via the desktop-gated `close_terminal` tool → `terminal.close`.
 *  The process is NOT killed — only the view is dropped; `surfacedProcs` keeps
 *  it from auto-resurfacing, and the status-stack row can reopen it on demand.
 *  No-op when no such tab exists. */
export function closeAgentTerminalByProc(procId) {
    const term = $terminals.get().find(t => t.kind === 'agent' && t.procId === procId);
    if (!term) {
        return false;
    }
    closeTerminal(term.id);
    return true;
}
export function closeActiveTerminal() {
    const id = $activeTerminalId.get();
    if (id) {
        closeTerminal(id);
    }
}
export function closeAllTerminals() {
    if ($terminals.get().length === 0) {
        return;
    }
    $terminals.set([]);
    $activeTerminalId.set(null);
    setTerminalTakeover(false);
}
export function closeOtherTerminals(id) {
    const keep = $terminals.get().find(term => term.id === id);
    if (keep) {
        $terminals.set([keep]);
        $activeTerminalId.set(keep.id);
    }
}
/** Record the latest serialized scrollback for a tab so it can be replayed on
 *  the next launch. Oversized buffers are tail-trimmed to stay under the storage
 *  budget; only user tabs ever carry one. */
export function updateTerminalReviveBuffer(id, reviveBuffer) {
    const capped = reviveBuffer.length > MAX_REVIVE_BUFFER_CHARS ? reviveBuffer.slice(-MAX_REVIVE_BUFFER_CHARS) : reviveBuffer;
    $terminals.set($terminals.get().map(term => (term.id === id && term.kind === 'user' ? { ...term, reviveBuffer: capped } : term)));
}
export function renameTerminal(id, title) {
    const trimmed = title.trim();
    $terminals.set($terminals.get().map(term => (term.id === id ? { ...term, title: trimmed || term.title, auto: false } : term)));
}
/** A live terminal reports its resolved shell; adopt it as the label only while
 *  the user hasn't named the tab themselves. */
export function reportTerminalShell(id, shell) {
    const name = shell.trim();
    if (!name) {
        return;
    }
    $terminals.set($terminals.get().map(term => (term.id === id && term.auto ? { ...term, title: name } : term)));
}
