import { jsx as _jsx } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { ModelVisibilityDialog } from '@/components/model-visibility-dialog';
import { $modelVisibilityOpen, setModelVisibilityOpen } from '@/store/model-visibility';
import { $activeSessionId, $gatewayState } from '@/store/session';
export function ModelVisibilityOverlay({ gateway, onOpenProviders }) {
    const activeSessionId = useStore($activeSessionId);
    const gatewayOpen = useStore($gatewayState) === 'open';
    const open = useStore($modelVisibilityOpen);
    if (!gatewayOpen) {
        return null;
    }
    return (_jsx(ModelVisibilityDialog, { gw: gateway, onOpenChange: setModelVisibilityOpen, onOpenProviders: onOpenProviders, open: open, sessionId: activeSessionId }));
}
