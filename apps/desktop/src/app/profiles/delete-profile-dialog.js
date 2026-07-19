import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteProfile } from '@/hermes';
import { useI18n } from '@/i18n';
import { $activeGatewayProfile, normalizeProfileKey, selectProfile, setActiveProfile } from '@/store/profile';
// Thin wrapper over ConfirmDialog: owns the deleteProfile call, inherits
// Enter-to-confirm + busy/done/error from the shared dialog. The single choke
// point for every delete entry point (rail + Profiles view).
export function DeleteProfileDialog({ profile, onClose, onDeleted, open }) {
    const { t } = useI18n();
    const p = t.profiles;
    return (_jsx(ConfirmDialog, { busyLabel: p.deleting, confirmLabel: t.common.delete, description: profile ? (_jsxs(_Fragment, { children: [p.deleteDescPrefix, _jsx("span", { className: "font-medium text-foreground", children: profile.name }), p.deleteDescMid, _jsx("span", { className: "font-mono text-xs", children: profile.path }), p.deleteDescSuffix] })) : null, destructive: true, doneLabel: p.deleted, onClose: onClose, onConfirm: async () => {
            if (!profile) {
                return;
            }
            // Deleting the profile the live gateway is on strands it on a dead
            // backend. Capture that before the delete; reset *after* the host's
            // onDeleted refresh so our reset is the last write — a refreshActiveProfile
            // racing the (still-dying) backend can't clobber the pill back to it.
            const wasActive = normalizeProfileKey(profile.name) === normalizeProfileKey($activeGatewayProfile.get());
            await deleteProfile(profile.name);
            await onDeleted?.();
            if (wasActive) {
                // Swap gateway/sidebar to default and set the pill now — the primary
                // backend is always default, so this is correct, not just optimistic.
                selectProfile('default');
                setActiveProfile('default');
            }
        }, open: open, title: p.deleteTitle }));
}
