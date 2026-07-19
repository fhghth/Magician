import { useSyncExternalStore } from 'react';
// Stable empty result so an absent key never yields a fresh array (which would
// defeat the snapshot bail-out and re-render on every store write).
const EMPTY = [];
/**
 * Subscribe to ONE session's slice of a `Record<sessionId, T[]>` nanostore,
 * re-rendering only when *that* slice's reference changes — not on writes to
 * other sessions. The map reference churns on every cross-session update, so a
 * plain `useStore(map)` re-renders all consumers globally; reading `map[key]`
 * through `useSyncExternalStore` bails out whenever the keyed array is
 * unchanged (the stores update immutably per key). Returns a shared empty array
 * when the key is null/absent.
 *
 * Note: only helps stores whose per-key arrays are referentially stable across
 * unrelated writes (plain atoms with immutable per-key updates). A `computed`
 * that rebuilds the whole map churns every slice — use a presence/edge selector
 * there instead.
 */
export function useSessionSlice(store, key) {
    return useSyncExternalStore(onChange => store.listen(onChange), () => (key ? (store.get()[key] ?? EMPTY) : EMPTY));
}
