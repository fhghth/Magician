import { useEffect, useState } from 'react';
import { getStatus } from '@/hermes';
import { evaluateRuntimeReadiness } from '@/lib/runtime-readiness';
const REFRESH_MS = 15_000;
export function useStatusSnapshot(gatewayState, requestGateway) {
    const [statusSnapshot, setStatusSnapshot] = useState(null);
    const [inferenceStatus, setInferenceStatus] = useState(null);
    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                const [next, inference] = await Promise.all([
                    getStatus(),
                    gatewayState === 'open'
                        ? evaluateRuntimeReadiness(requestGateway).catch(error => ({
                            checksDisagree: false,
                            ready: false,
                            reason: error instanceof Error ? error.message : String(error),
                            source: 'fallback'
                        }))
                        : Promise.resolve(null)
                ]);
                if (cancelled) {
                    return;
                }
                setStatusSnapshot(next);
                setInferenceStatus(inference);
            }
            catch {
                // Keep last snapshot through transient gateway flaps.
            }
        };
        void refresh();
        const timer = window.setInterval(() => void refresh(), REFRESH_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [gatewayState, requestGateway]);
    return { inferenceStatus, statusSnapshot };
}
