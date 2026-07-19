import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getMemoryProviderOAuthStatus, startMemoryProviderOAuth } from '@/hermes';
import { Check, ExternalLink, Loader2 } from '@/lib/icons';
import { notifyError } from '@/store/notifications';
const POLL_MS = 1500;
const POLL_TIMEOUT_MS = 120_000;
// Small connect affordance rendered under the provider dropdown. Capability is
// backend-driven: the status route 404s for providers without an oauth_flow
// module, so non-OAuth providers render nothing.
export function MemoryConnect({ provider }) {
    const [capable, setCapable] = useState('unknown');
    const [connected, setConnected] = useState(false);
    const [auth, setAuth] = useState(null);
    const [phase, setPhase] = useState('idle');
    const [detail, setDetail] = useState('');
    const timer = useRef(null);
    const deadline = useRef(0);
    const stop = useCallback(() => {
        if (timer.current !== null) {
            clearInterval(timer.current);
            timer.current = null;
        }
    }, []);
    useEffect(() => {
        let active = true;
        setCapable('unknown');
        getMemoryProviderOAuthStatus(provider)
            .then(s => {
            if (!active) {
                return;
            }
            setCapable('yes');
            setConnected(s.connected);
            setAuth(s.auth);
        })
            .catch(() => {
            if (active) {
                setCapable('no');
            }
        });
        return () => {
            active = false;
            stop();
        };
    }, [provider, stop]);
    // An error message isn't sticky — it clears back to the steady state
    // (Connect link, plus the connected badge if a credential is stored).
    useEffect(() => {
        if (phase !== 'error') {
            return;
        }
        const t = setTimeout(() => {
            setPhase('idle');
            setDetail('');
        }, 6000);
        return () => clearTimeout(t);
    }, [phase]);
    const connect = useCallback(async () => {
        setPhase('pending');
        try {
            await startMemoryProviderOAuth(provider);
        }
        catch (err) {
            setPhase('error');
            setDetail('Could not start the connection.');
            notifyError(err, 'Failed to start connection');
            return;
        }
        deadline.current = Date.now() + POLL_TIMEOUT_MS;
        stop();
        timer.current = setInterval(() => {
            void (async () => {
                try {
                    const next = await getMemoryProviderOAuthStatus(provider);
                    if (next.state === 'pending') {
                        if (Date.now() > deadline.current) {
                            stop();
                            setPhase('error');
                            setDetail('Timed out — try again.');
                        }
                        return;
                    }
                    stop();
                    setConnected(next.connected);
                    setAuth(next.auth);
                    if (next.state === 'error') {
                        setPhase('error');
                        setDetail(next.detail || 'Connection failed.');
                    }
                    else {
                        setPhase('idle');
                    }
                }
                catch {
                    // Transient poll failure — keep trying until the deadline.
                }
            })();
        }, POLL_MS);
    }, [provider, stop]);
    const cancel = useCallback(() => {
        stop();
        setPhase('idle');
    }, [stop]);
    if (capable !== 'yes') {
        return null;
    }
    const connectLabel = connected ? (auth === 'apikey' ? 'Connect via OAuth' : 'Reconnect') : 'Connect';
    return (_jsxs("span", { className: "inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", children: [phase === 'idle' && connected && (_jsxs("span", { className: "inline-flex items-center gap-1 text-muted-foreground", children: [_jsx(Check, { className: "size-3" }), auth === 'apikey' ? 'api key set' : 'oauth set'] })), phase === 'pending' ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: "inline-flex items-center gap-1.5 text-muted-foreground", children: [_jsx(Loader2, { className: "size-3 animate-spin" }), "Waiting for browser consent\u2026"] }), _jsx(Button, { className: "h-auto p-0 text-xs", onClick: cancel, size: "sm", type: "button", variant: "link", children: "Cancel" })] })) : (_jsxs(Button, { className: "h-auto gap-1 p-0 text-xs", onClick: () => void connect(), size: "sm", type: "button", variant: "link", children: [_jsx(ExternalLink, { className: "size-3" }), connectLabel] })), phase === 'error' && detail && _jsx("span", { className: "text-destructive", children: detail })] }));
}
