import { useEffect, useState } from 'react';
/** Debounce a fast-changing value (search input, slider, …) so effects/queries
 *  keyed on it only fire once the value settles. */
export function useDebounced(value, delayMs) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
    }, [value, delayMs]);
    return debounced;
}
