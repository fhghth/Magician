import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { ArchiveSkillConfirmDialog, fireOptimistic } from '@/app/learning/archive-skill-confirm-dialog';
import { CodeEditor } from '@/components/chat/code-editor';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteLearningNode, editLearningNode, getLearningNode } from '@/hermes';
import { notifyError } from '@/store/notifications';
import { evictStarmapNode, loadStarmapGraph } from '@/store/starmap';
import { useOnProfileSwitch } from '../hooks/use-on-profile-switch';
/** Right-click actions for a star-map node: edit (modal) or delete (confirm). */
export function NodeContextMenu({ onClose, onNodeRemoved, target }) {
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // Bumped on profile switch so an in-flight openEdit fetch from profile A can't
    // reopen the editor with A's node content after switching to B.
    const editEpoch = useRef(0);
    // A profile switch swaps the backend under an open edit/delete dialog — its
    // node id belongs to the previous profile, so a Save/Delete after the switch
    // would hit the newly active profile. Close everything on switch.
    useOnProfileSwitch(() => {
        editEpoch.current += 1;
        setEditing(null);
        setDeleting(null);
        setError(null);
    });
    const noun = target?.kind === 'memory' ? 'memory' : 'skill';
    const openEdit = async () => {
        if (!target) {
            return;
        }
        const epoch = editEpoch.current;
        setLoading(true);
        setError(null);
        try {
            const detail = await getLearningNode(target.id);
            if (editEpoch.current !== epoch) {
                return;
            }
            setEditing({ content: detail.content, id: target.id, label: target.label });
            onClose();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    };
    const save = async () => {
        if (!editing) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await editLearningNode(editing.id, editing.content);
            if (!res.ok) {
                throw new Error(res.message);
            }
            setEditing(null);
            void loadStarmapGraph(true);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    };
    const menuOpen = target && !editing && !deleting;
    return (_jsxs(_Fragment, { children: [menuOpen ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-50", onClick: onClose, onContextMenu: e => e.preventDefault() }), _jsxs("div", { className: "fixed z-50 min-w-36 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1 shadow-md backdrop-blur-md", style: { left: target.x, top: target.y }, children: [_jsx("div", { className: "truncate px-2 py-1 text-[0.68rem] text-muted-foreground", children: target.label }), _jsxs("button", { className: "block w-full cursor-pointer rounded-md px-2 py-1 text-left text-xs hover:bg-(--ui-control-active-background) hover:text-foreground disabled:opacity-50", disabled: loading, onClick: () => void openEdit(), type: "button", children: ["Edit ", noun, "\u2026"] }), _jsx("button", { className: "block w-full cursor-pointer rounded-md px-2 py-1 text-left text-xs text-destructive hover:bg-destructive/10", onClick: () => {
                                    setDeleting({ id: target.id, kind: target.kind, label: target.label });
                                    onClose();
                                }, type: "button", children: target.kind === 'skill' ? 'Archive skill' : 'Delete memory' })] })] })) : null, _jsx(Dialog, { onOpenChange: value => !value && !saving && setEditing(null), open: Boolean(editing), children: _jsxs(DialogContent, { className: "max-w-2xl", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { children: ["Edit ", editing?.label] }) }), _jsx("div", { className: "h-80", children: editing && (_jsx(CodeEditor, { filePath: noun === 'skill' ? 'SKILL.md' : 'memory.md', framed: true, initialValue: editing.content, onCancel: () => !saving && setEditing(null), onChange: content => setEditing(prev => (prev ? { ...prev, content } : prev)), onSave: () => void save() }, editing.id)) }), error ? _jsx("p", { className: "text-xs text-destructive", children: error }) : null, _jsxs(DialogFooter, { children: [_jsx(Button, { disabled: saving, onClick: () => setEditing(null), type: "button", variant: "ghost", children: "Cancel" }), _jsx(Button, { disabled: saving, onClick: () => void save(), children: saving ? 'Saving…' : 'Save' })] })] }) }), deleting?.kind === 'skill' ? (_jsx(ArchiveSkillConfirmDialog, { onApply: () => {
                    onNodeRemoved();
                    return evictStarmapNode(deleting.id);
                }, onClose: () => setDeleting(null), onFailure: (err, name) => notifyError(err, name), open: true, skillId: deleting.id, skillName: deleting.label })) : (_jsx(ConfirmDialog, { confirmLabel: "Delete", description: "This memory is removed permanently.", destructive: true, dismissOnConfirm: true, onClose: () => setDeleting(null), onConfirm: () => {
                    if (!deleting) {
                        return;
                    }
                    const { id, label } = deleting;
                    const rollback = evictStarmapNode(id);
                    onNodeRemoved();
                    fireOptimistic(deleteLearningNode(id).then(res => {
                        if (!res.ok) {
                            throw new Error(res.message);
                        }
                    }), rollback, err => notifyError(err, label));
                }, open: Boolean(deleting), title: `Delete ${deleting?.label ?? ''}?` }))] }));
}
