import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
const EMPTY_QUERY = '\u0000';
export function useLiveCompletionAdapter(options) {
    const { enabled, debounceMs = 60, fetcher, toItem } = options;
    const [state, setState] = useState({
        query: EMPTY_QUERY,
        items: []
    });
    const [loading, setLoading] = useState(false);
    const tokenRef = useRef(0);
    const timerRef = useRef(null);
    const pendingQueryRef = useRef(null);
    const cancelTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);
    useEffect(() => () => cancelTimer(), [cancelTimer]);
    useEffect(() => {
        if (enabled) {
            return;
        }
        cancelTimer();
        pendingQueryRef.current = null;
        tokenRef.current += 1;
        setLoading(false);
        setState({ query: EMPTY_QUERY, items: [] });
    }, [cancelTimer, enabled]);
    const scheduleFetch = useCallback((query) => {
        if (!enabled) {
            return;
        }
        if (pendingQueryRef.current === query) {
            return;
        }
        pendingQueryRef.current = query;
        cancelTimer();
        const token = ++tokenRef.current;
        setLoading(true);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            fetcher(query)
                .then(payload => {
                if (token !== tokenRef.current) {
                    return;
                }
                setState({
                    query: payload.query,
                    items: payload.items.map((entry, index) => toItem(entry, index))
                });
            })
                .catch(() => {
                if (token !== tokenRef.current) {
                    return;
                }
                setState({ query, items: [] });
            })
                .finally(() => {
                if (token === tokenRef.current) {
                    setLoading(false);
                }
            });
        }, debounceMs);
    }, [cancelTimer, debounceMs, enabled, fetcher, toItem]);
    const adapter = useMemo(() => ({
        categories: () => [],
        categoryItems: () => [],
        search: (query) => {
            if (query !== state.query) {
                scheduleFetch(query);
            }
            return state.items;
        }
    }), [scheduleFetch, state]);
    return { adapter, loading };
}
