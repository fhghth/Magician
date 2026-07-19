import { jsx as _jsx } from "react/jsx-runtime";
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteLearningNode } from '@/hermes';
import { useI18n } from '@/i18n';
import { notify } from '@/store/notifications';
export const ARCHIVE_SKILL_DESCRIPTION = 'The skill is archived and can be restored with `hermes curator restore`.';
export function notifySkillArchived(t) {
    notify({ kind: 'success', message: t.skills.skillArchivedMessage, title: t.skills.skillArchivedTitle });
}
export async function archiveLearningSkill(id) {
    const res = await deleteLearningNode(id);
    if (!res.ok) {
        throw new Error(res.message || 'Archive failed');
    }
}
/** Fire-and-forget a mutation whose UI already applied optimistically; a failure just rolls it back + reports. */
export function fireOptimistic(action, rollback, onFailure) {
    void action.catch(err => {
        rollback();
        onFailure(err);
    });
}
/** Shared archive confirm for learned skills (capabilities page + memory graph). */
export function ArchiveSkillConfirmDialog({ onApply, onClose, onFailure, onSuccess, open, skillId, skillName }) {
    const { t } = useI18n();
    return (_jsx(ConfirmDialog, { confirmLabel: "Archive", description: ARCHIVE_SKILL_DESCRIPTION, destructive: true, dismissOnConfirm: true, onClose: onClose, onConfirm: () => {
            const rollback = onApply();
            fireOptimistic(archiveLearningSkill(skillId).then(() => {
                notifySkillArchived(t);
                onSuccess?.();
            }), rollback, err => onFailure?.(err, skillName));
        }, open: open, title: `Archive ${skillName}?` }));
}
