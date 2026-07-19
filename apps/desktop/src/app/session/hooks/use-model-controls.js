import { useCallback } from 'react';
import { getGlobalModelInfo } from '@/hermes';
import { useI18n } from '@/i18n';
import { notifyError } from '@/store/notifications';
import { $activeSessionId, $currentModel, $currentProvider, setCurrentModel, setCurrentProvider } from '@/store/session';
export function useModelControls({ activeSessionId, queryClient, requestGateway }) {
    const { t } = useI18n();
    const copy = t.desktop;
    const updateModelOptionsCache = useCallback((provider, model, includeGlobal) => {
        const patch = (prev) => ({ ...(prev ?? {}), provider, model });
        queryClient.setQueryData(['model-options', activeSessionId || 'global'], patch);
        if (includeGlobal) {
            queryClient.setQueryData(['model-options', 'global'], patch);
        }
    }, [activeSessionId, queryClient]);
    // Seed the composer's model state from the profile default. `force` reseeds
    // for a profile swap (the new profile has its own default); otherwise this
    // only fills an EMPTY selection so a user's pick (plain UI state in
    // $currentModel) survives the lifecycle refreshes that fire on boot / fresh
    // draft / session events. A live session owns the footer, so skip entirely.
    const refreshCurrentModel = useCallback(async (force = false) => {
        try {
            if ($activeSessionId.get()) {
                return;
            }
            if (!force && $currentModel.get()) {
                return;
            }
            const result = await getGlobalModelInfo();
            if ($activeSessionId.get() || (!force && $currentModel.get())) {
                return;
            }
            if (typeof result.model === 'string') {
                setCurrentModel(result.model);
            }
            if (typeof result.provider === 'string') {
                setCurrentProvider(result.provider);
            }
        }
        catch {
            // The delayed session.info event still updates this once the agent is ready.
        }
    }, []);
    // Returns whether the switch succeeded so callers can await it before applying
    // follow-up changes. The composer model is plain UI state: with no live
    // session it's just stored (and shipped on the next session.create); with one
    // it's scoped to that session via config.set. It NEVER writes the profile
    // default — that lives in Settings → Model — so picking a model here can't
    // silently mutate global config.
    const selectModel = useCallback(async (selection) => {
        // Snapshot for rollback: the switch is applied optimistically, so a
        // failure must restore the prior model/provider (store + query cache)
        // rather than leave the UI showing a model the backend never selected.
        const prevModel = $currentModel.get();
        const prevProvider = $currentProvider.get();
        setCurrentModel(selection.model);
        setCurrentProvider(selection.provider);
        updateModelOptionsCache(selection.provider, selection.model, !activeSessionId);
        // No live session yet: the pick is pure UI state. session.create reads
        // $currentModel/$currentProvider and applies it as that session's override.
        if (!activeSessionId) {
            return true;
        }
        try {
            await requestGateway('config.set', {
                session_id: activeSessionId,
                key: 'model',
                value: `${selection.model} --provider ${selection.provider}`
            });
            void queryClient.invalidateQueries({ queryKey: ['model-options', activeSessionId] });
            return true;
        }
        catch (err) {
            setCurrentModel(prevModel);
            setCurrentProvider(prevProvider);
            updateModelOptionsCache(prevProvider, prevModel, !activeSessionId);
            notifyError(err, copy.modelSwitchFailed);
            return false;
        }
    }, [activeSessionId, copy.modelSwitchFailed, queryClient, requestGateway, updateModelOptionsCache]);
    return { refreshCurrentModel, selectModel, updateModelOptionsCache };
}
