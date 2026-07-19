import { getGlobalModelOptions } from '@/hermes';
export function requestModelOptions({ explicitOnly = true, gateway, refresh = false, sessionId }) {
    if (gateway) {
        const params = {};
        if (sessionId) {
            params.session_id = sessionId;
        }
        if (refresh) {
            params.refresh = true;
        }
        if (explicitOnly) {
            params.explicit_only = true;
        }
        return gateway.request('model.options', params);
    }
    return getGlobalModelOptions({ explicitOnly, ...(refresh ? { refresh: true } : {}) });
}
