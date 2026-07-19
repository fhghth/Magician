import { useCallback, useMemo, useState } from 'react';
export function useGroupRegistry() {
    const [groups, setGroups] = useState({ left: {}, right: {} });
    const set = useCallback((id, items, side = 'right') => {
        setGroups(current => {
            const next = { ...current, [side]: { ...current[side] } };
            if (items.length === 0) {
                delete next[side][id];
            }
            else {
                next[side][id] = items;
            }
            return next;
        });
    }, []);
    const flat = useMemo(() => ({
        left: Object.values(groups.left).flat(),
        right: Object.values(groups.right).flat()
    }), [groups]);
    return { flat, set };
}
