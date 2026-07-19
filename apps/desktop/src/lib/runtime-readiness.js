const DEFAULT_NOT_READY_REASON = 'Add a provider credential before sending your first message.';
function toErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error === null || error === undefined) {
        return null;
    }
    return String(error);
}
function normalizeMessage(value) {
    const next = value?.trim();
    return next ? next : null;
}
async function requestWithFallback(requestGateway, method, params) {
    try {
        return { error: null, value: await requestGateway(method, params) };
    }
    catch (error) {
        return { error: toErrorMessage(error), value: null };
    }
}
export async function fetchRuntimeReadinessSignals(requestGateway, requestedProvider) {
    const runtimeParams = requestedProvider?.trim() ? { provider: requestedProvider.trim() } : undefined;
    const [setup, runtime] = await Promise.all([
        requestWithFallback(requestGateway, 'setup.status'),
        requestWithFallback(requestGateway, 'setup.runtime_check', runtimeParams)
    ]);
    return {
        setup: setup.value,
        setupError: setup.error,
        runtime: runtime.value,
        runtimeError: runtime.error
    };
}
export function interpretRuntimeReadiness(signals, options = {}) {
    const defaultReason = options.defaultReason ?? DEFAULT_NOT_READY_REASON;
    const unknownReady = options.unknownReady ?? false;
    const setupConfigured = typeof signals.setup?.provider_configured === 'boolean' ? Boolean(signals.setup.provider_configured) : undefined;
    const runtimeOk = typeof signals.runtime?.ok === 'boolean' ? Boolean(signals.runtime.ok) : undefined;
    const runtimeFailure = normalizeMessage(signals.runtime?.error) ?? normalizeMessage(signals.runtimeError);
    const setupFailure = normalizeMessage(signals.setupError);
    const checksDisagree = typeof setupConfigured === 'boolean' && typeof runtimeOk === 'boolean' && setupConfigured !== runtimeOk;
    if (typeof runtimeOk === 'boolean') {
        if (runtimeOk) {
            return {
                checksDisagree,
                ready: true,
                reason: null,
                source: 'runtime_check'
            };
        }
        let reason = runtimeFailure ?? defaultReason;
        if (checksDisagree && setupConfigured) {
            reason = `${reason} setup.status reports configured credentials, but runtime resolution still failed.`;
        }
        return {
            checksDisagree,
            ready: false,
            reason,
            source: 'runtime_check'
        };
    }
    if (typeof setupConfigured === 'boolean') {
        return {
            checksDisagree: false,
            ready: setupConfigured,
            reason: setupConfigured ? null : (runtimeFailure ?? setupFailure ?? defaultReason),
            source: 'setup_status'
        };
    }
    return {
        checksDisagree: false,
        ready: unknownReady,
        reason: unknownReady ? null : (runtimeFailure ?? setupFailure ?? defaultReason),
        source: 'fallback'
    };
}
export async function evaluateRuntimeReadiness(requestGateway, options = {}) {
    const signals = await fetchRuntimeReadinessSignals(requestGateway, options.requestedProvider);
    return interpretRuntimeReadiness(signals, options);
}
