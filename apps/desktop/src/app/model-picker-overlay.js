import { jsx as _jsx } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { ModelPickerDialog } from '@/components/model-picker';
import { $activeSessionId, $currentModel, $currentProvider, $gatewayState, $modelPickerOpen, setModelPickerOpen } from '@/store/session';
export function ModelPickerOverlay({ gateway, onSelect }) {
    const activeSessionId = useStore($activeSessionId);
    const currentModel = useStore($currentModel);
    const currentProvider = useStore($currentProvider);
    const gatewayOpen = useStore($gatewayState) === 'open';
    const open = useStore($modelPickerOpen);
    if (!gatewayOpen) {
        return null;
    }
    return (_jsx(ModelPickerDialog, { currentModel: currentModel, currentProvider: currentProvider, gw: gateway, onOpenChange: setModelPickerOpen, onSelect: onSelect, open: open, sessionId: activeSessionId }));
}
