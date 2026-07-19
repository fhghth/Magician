import { AssistantRuntimeImpl, BaseAssistantRuntimeCore, ExternalStoreThreadListRuntimeCore, ExternalStoreThreadRuntimeCore, hasUpcomingMessage } from '@assistant-ui/core/internal';
import { useRuntimeAdapters } from '@assistant-ui/react';
import { useEffect, useMemo, useState } from 'react';
const EMPTY_ARRAY = Object.freeze([]);
const shallowEqual = (a, b) => {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) {
        return false;
    }
    for (const key of aKeys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
};
const getThreadListAdapter = (store) => store.adapters?.threadList ?? {};
function syncRepositoryIncrementally(runtime, messageRepository) {
    const repository = runtime.repository;
    const incomingIds = new Set(messageRepository.messages.map(({ message }) => message.id));
    for (const { message, parentId } of messageRepository.messages) {
        repository.addOrUpdateMessage(parentId, message);
    }
    for (const { message } of repository.export().messages) {
        if (!incomingIds.has(message.id)) {
            repository.deleteMessage(message.id);
        }
    }
    const headId = messageRepository.headId ?? messageRepository.messages.at(-1)?.message.id ?? null;
    repository.resetHead(headId);
    return repository.getMessages();
}
class IncrementalExternalStoreThreadRuntimeCore extends ExternalStoreThreadRuntimeCore {
    __internal_setAdapter(store) {
        if (!store.messageRepository) {
            super.__internal_setAdapter(store);
            return;
        }
        const self = this;
        if (self._store === store) {
            return;
        }
        const isRunning = store.isRunning ?? false;
        this.isDisabled = store.isDisabled ?? false;
        const oldStore = self._store;
        self._store = store;
        if (this.extras !== store.extras) {
            this.extras = store.extras;
        }
        const newSuggestions = store.suggestions ?? EMPTY_ARRAY;
        if (!shallowEqual(this.suggestions, newSuggestions)) {
            this.suggestions = newSuggestions;
        }
        const newCapabilities = {
            switchToBranch: store.setMessages !== undefined,
            switchBranchDuringRun: false,
            edit: store.onEdit !== undefined,
            reload: store.onReload !== undefined,
            cancel: store.onCancel !== undefined,
            speech: store.adapters?.speech !== undefined,
            dictation: store.adapters?.dictation !== undefined,
            voice: store.adapters?.voice !== undefined,
            unstable_copy: store.unstable_capabilities?.copy !== false,
            attachments: !!store.adapters?.attachments,
            feedback: !!store.adapters?.feedback,
            queue: false
        };
        if (!shallowEqual(self._capabilities, newCapabilities)) {
            self._capabilities = newCapabilities;
        }
        if (oldStore && oldStore.isRunning === store.isRunning && oldStore.messageRepository === store.messageRepository) {
            self._notifySubscribers();
            return;
        }
        if (self._assistantOptimisticId) {
            this.repository.deleteMessage(self._assistantOptimisticId);
            self._assistantOptimisticId = null;
        }
        const messages = syncRepositoryIncrementally(this, store.messageRepository);
        if (messages.length > 0) {
            this.ensureInitialized();
        }
        if ((oldStore?.isRunning ?? false) !== (store.isRunning ?? false)) {
            self._notifyEventSubscribers(store.isRunning ? 'runStart' : 'runEnd', {});
        }
        if (hasUpcomingMessage(isRunning, messages)) {
            self._assistantOptimisticId = this.repository.appendOptimisticMessage(messages.at(-1)?.id ?? null, {
                role: 'assistant',
                content: []
            });
        }
        this.repository.resetHead(self._assistantOptimisticId ?? messages.at(-1)?.id ?? null);
        self._messages = this.repository.getMessages();
        self._notifySubscribers();
    }
}
class IncrementalExternalStoreRuntimeCore extends BaseAssistantRuntimeCore {
    threads;
    constructor(adapter) {
        super();
        this.threads = new ExternalStoreThreadListRuntimeCore(getThreadListAdapter(adapter), () => new IncrementalExternalStoreThreadRuntimeCore(this._contextProvider, adapter));
    }
    setAdapter(adapter) {
        this.threads.__internal_setAdapter(getThreadListAdapter(adapter));
        this.threads.getMainThreadRuntimeCore().__internal_setAdapter(adapter);
    }
}
export function useIncrementalExternalStoreRuntime(store) {
    const [runtime] = useState(() => new IncrementalExternalStoreRuntimeCore(store));
    useEffect(() => {
        runtime.setAdapter(store);
    });
    const { modelContext } = useRuntimeAdapters() ?? {};
    useEffect(() => {
        if (!modelContext) {
            return undefined;
        }
        return runtime.registerModelContextProvider(modelContext);
    }, [modelContext, runtime]);
    return useMemo(() => new AssistantRuntimeImpl(runtime), [runtime]);
}
