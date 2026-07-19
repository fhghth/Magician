import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { PetSprite } from '@/components/pet/pet-sprite';
import { PetStarShower } from '@/components/pet/pet-star-shower';
import { PixelEggSprite } from '@/components/pet/pixel-egg-sprite';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Loader2, PawPrint, RefreshCw } from '@/lib/icons';
import { frameCountForRow } from '../lib/frame-count';
const PREVIEW_SCALE = 0.7;
const PREVIEW_STATE_MS = 1400;
const PREVIEW_ROWS = [
    'idle',
    'waving',
    'running-right',
    'running-left',
    'running',
    'review',
    'jumping',
    'failed',
    'waiting'
];
export function HatchPreview({ pet, adopting, error, onAdopt, onDiscard }) {
    const { t } = useI18n();
    const copy = t.commandCenter.generatePet;
    // Empty so the "Name your pet" placeholder shows; blank adopt keeps the
    // provisional name from the prompt.
    const [name, setName] = useState('');
    // Play the egg's crack/hatch frames once before swapping in the live pet.
    const [revealed, setRevealed] = useState(false);
    // Right after the egg cracks the pet plays its "yay" jump a couple times, then
    // hands off to the normal state-cycling preview.
    const [celebrating, setCelebrating] = useState(false);
    const [stateIndex, setStateIndex] = useState(0);
    const previewRows = (pet.stateRows?.length ? pet.stateRows : PREVIEW_ROWS).filter(row => frameCountForRow(pet, row) > 0);
    const rows = previewRows.length > 0 ? previewRows : ['idle'];
    const activeRow = rows[stateIndex % rows.length] ?? 'idle';
    const canJump = frameCountForRow(pet, 'jumping') > 0;
    const rowOverride = celebrating && canJump ? 'jumping' : activeRow;
    useEffect(() => {
        const id = setInterval(() => setStateIndex(i => (i + 1) % rows.length), PREVIEW_STATE_MS);
        return () => clearInterval(id);
    }, [rows.length]);
    // On reveal: celebrate (jump) ~2 loops, then drop into the cycling preview.
    useEffect(() => {
        if (!revealed) {
            return;
        }
        setCelebrating(true);
        const id = setTimeout(() => {
            setCelebrating(false);
            setStateIndex(0);
        }, 2 * (pet.loopMs ?? 1100));
        return () => clearTimeout(id);
    }, [revealed, pet.loopMs]);
    useEffect(() => {
        setStateIndex(0);
        setName('');
        setRevealed(false);
        setCelebrating(false);
    }, [pet.slug]);
    const previewInfo = { ...pet, scale: PREVIEW_SCALE };
    return (_jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx("div", { className: "relative flex aspect-[192/208] w-full items-center justify-center overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary)", children: revealed ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative inline-block", children: [_jsx("span", { "aria-hidden": true, className: "pet-contact-shadow" }), _jsx("div", { className: "pet-reveal relative z-10", children: _jsx(PetSprite, { info: previewInfo, rowOverride: rowOverride }) })] }), _jsx(PetStarShower, {})] })) : (_jsx(PixelEggSprite, { mode: "hatch", onDone: () => {
                        setRevealed(true);
                        triggerHaptic('crisp');
                    }, size: 150 })) }), _jsx(Input, { autoFocus: true, className: "w-full", onChange: event => setName(event.target.value), onKeyDown: event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        onAdopt(name);
                    }
                }, placeholder: copy.namePlaceholder, value: name }), error && (_jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: error }) })), _jsxs("div", { className: "flex w-full items-center gap-1.5", children: [_jsxs(Button, { disabled: adopting, onClick: onDiscard, variant: "ghost", children: [_jsx(RefreshCw, {}), copy.startOver] }), _jsxs(Button, { className: "flex-1", disabled: adopting, onClick: () => onAdopt(name), children: [adopting ? _jsx(Loader2, { className: "animate-spin" }) : _jsx(PawPrint, {}), copy.adopt] })] })] }));
}
