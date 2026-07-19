import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request';
import { SETTINGS_ROUTE } from '@/app/routes';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GenerateButton } from '@/components/ui/generate-button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { triggerHaptic } from '@/lib/haptics';
import { Egg, ImageIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { $petGenAvailable, $petGenDrafts, $petGenError, $petGenInput, $petGenPreview, $petGenRefImage, $petGenRefName, $petGenRemixConfirmed, $petGenSelected, $petGenStage, $petGenStatus, adoptHatched, cancelGenerate, checkPetGenAvailable, cleanPetName, closePetGenerate, discardDrafts, discardHatched, generateDrafts, hatchSelected, markRemixConfirmed } from '@/store/pet-generate';
import { DraftGrid } from './components/draft-grid';
import { EmptyHint } from './components/empty-hint';
import { GenerateUnavailable } from './components/generate-unavailable';
import { HatchPreview } from './components/hatch-preview';
import { HatchingView } from './components/hatching-view';
import { ProviderPicker } from './components/provider-picker';
import { ReferenceChip } from './components/reference-chip';
import { readReferenceImage } from './lib/read-reference-image';
// The generate → hatch → adopt controller. A thin view over the `pet-generate`
// store; the store owns the steps and persists inputs across close/reopen.
export function PetGenerateContent() {
    const { t } = useI18n();
    const copy = t.commandCenter.generatePet;
    const { requestGateway } = useGatewayRequest();
    const navigate = useNavigate();
    const status = useStore($petGenStatus);
    const error = useStore($petGenError);
    const available = useStore($petGenAvailable);
    // `null` = not yet probed → stay optimistic (show the prompt); only the
    // confirmed-no-backend case swaps in the setup card.
    const unavailable = available === false;
    const drafts = useStore($petGenDrafts);
    const selected = useStore($petGenSelected);
    const preview = useStore($petGenPreview);
    const stage = useStore($petGenStage);
    // Inputs live in atoms so they survive a close/reopen (and background runs).
    const prompt = useStore($petGenInput);
    const refImage = useStore($petGenRefImage);
    const refName = useStore($petGenRefName);
    const fileRef = useRef(null);
    // The draft awaiting the one-time "remix regenerates" confirmation.
    const [remixPending, setRemixPending] = useState(null);
    // Probe backend availability on open — and again whenever the content
    // remounts (e.g. after returning from the providers settings), so adding a
    // key flips the setup card to the prompt with no manual refresh.
    useEffect(() => {
        void checkPetGenAvailable(requestGateway);
    }, [requestGateway]);
    const busy = status === 'generating' || status === 'hatching';
    const hasDrafts = drafts.length > 0;
    const generating = status === 'generating';
    // The idle "describe a pet" state — egg + suggestions get generous, equidistant
    // breathing room (gap-4) from the prompt; the working states stay compact.
    const isEmptyState = !hasDrafts &&
        !generating &&
        status !== 'hatching' &&
        status !== 'preview' &&
        status !== 'adopting' &&
        status !== 'stale';
    const generate = () => {
        if ((prompt.trim() || refImage) && !busy) {
            void generateDrafts(requestGateway, { prompt: prompt.trim(), referenceImage: refImage ?? undefined });
        }
    };
    const clearReference = () => {
        $petGenRefImage.set(null);
        $petGenRefName.set('');
    };
    const pickReference = (file) => {
        if (!file) {
            return;
        }
        const mapReferenceError = (reason) => {
            const message = reason instanceof Error ? reason.message.toLowerCase() : '';
            return message.includes('too large') ? copy.referenceImageTooLarge : copy.referenceImageInvalid;
        };
        void readReferenceImage(file)
            .then(dataUrl => {
            $petGenRefImage.set(dataUrl);
            $petGenRefName.set(file.name);
            // Clear picker-only errors once the reference is valid again.
            if ($petGenStatus.get() === 'error' && $petGenDrafts.get().length === 0) {
                $petGenStatus.set('idle');
                $petGenError.set(null);
            }
        })
            .catch(reason => {
            $petGenRefImage.set(null);
            $petGenRefName.set('');
            $petGenError.set(mapReferenceError(reason));
            if (!busy) {
                $petGenStatus.set('error');
            }
        });
    };
    // One-click an example prompt straight into a draft round.
    const runExample = (example) => {
        $petGenInput.set(example);
        void generateDrafts(requestGateway, { prompt: example });
    };
    // A remix re-runs generation grounded on an existing draft — same prompt, stay
    // on step 2 — so the user explores variations without starting over.
    const runRemix = (draft) => {
        void generateDrafts(requestGateway, { prompt: prompt.trim(), referenceImage: draft.dataUri });
    };
    // Slow, and it replaces the current drafts — so confirm once, then remember it.
    const remixDraft = (draft) => {
        if (busy) {
            return;
        }
        if ($petGenRemixConfirmed.get()) {
            runRemix(draft);
            return;
        }
        setRemixPending(draft);
    };
    // Hatch the selected draft. The user can pick one before the rest stream in —
    // if so, abort the remaining generations first (keeping the drafts we have).
    // The prompt is grounding text, not a label; the user names it on reveal.
    const hatch = () => {
        if (selected === null) {
            return;
        }
        if (generating) {
            cancelGenerate();
        }
        void hatchSelected(requestGateway, { name: cleanPetName(prompt), prompt: prompt.trim() });
    };
    const adopt = (finalName) => {
        void adoptHatched(requestGateway, finalName).then(out => {
            if (out.ok) {
                triggerHaptic('crisp');
                closePetGenerate();
            }
        });
    };
    // The header title tracks the phase instead of sticking on "Generate a pet".
    const headerTitle = status === 'hatching' ? copy.spawning : status === 'preview' || status === 'adopting' ? copy.hatched : copy.title;
    // Send the user to set up a key without closing — the overlay yields to the
    // settings route (useRouteOverlayActive) and reappears + re-checks on return.
    const setupImageGen = () => navigate(`${SETTINGS_ROUTE}?tab=providers`);
    // Prompt input only belongs on the describe/draft screens (and never when
    // there's no backend to generate with).
    const showPrompt = !unavailable && status !== 'hatching' && status !== 'preview' && status !== 'adopting';
    return (_jsxs(_Fragment, { children: [unavailable ? (_jsx(DialogTitle, { className: "sr-only", children: copy.title })) : (_jsx(DialogHeader, { children: _jsx(DialogTitle, { icon: Egg, children: headerTitle }) })), _jsxs("div", { className: cn('flex min-h-0 flex-1 flex-col', isEmptyState ? 'gap-4' : 'gap-2.5'), children: [showPrompt && (_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsxs("div", { className: "relative", children: [_jsx(Input, { autoFocus: true, className: "pr-9", onChange: event => $petGenInput.set(event.target.value), onKeyDown: event => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                generate();
                                            }
                                        }, placeholder: copy.placeholder, value: prompt }), _jsx(GenerateButton, { className: "absolute right-1 top-1/2 -translate-y-1/2", disabled: !prompt.trim() && !refImage, generating: generating, generatingLabel: t.common.cancel, label: copy.generate, 
                                        // Inline cancel should match step-2 cancel semantics: abort and
                                        // return to step 1 (prompt retained for quick tweaks).
                                        onCancel: discardDrafts, onGenerate: generate })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ProviderPicker, {}), refImage ? (_jsx(ReferenceChip, { name: refName, onRemove: clearReference, src: refImage })) : (_jsxs("button", { className: "ml-auto flex h-6 items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition hover:text-foreground", onClick: () => fileRef.current?.click(), type: "button", children: [_jsx(ImageIcon, { className: "size-3" }), "Add a reference"] }))] }), _jsx(Input, { accept: "image/*", className: "hidden", onChange: event => {
                                    pickReference(event.target.files?.[0]);
                                    event.target.value = '';
                                }, ref: fileRef, type: "file" })] })), status === 'error' && hasDrafts && (_jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: error || copy.genericError }) })), unavailable ? (_jsx(GenerateUnavailable, { onSetup: setupImageGen })) : status === 'stale' ? (_jsx(Alert, { variant: "destructive", children: _jsx(AlertDescription, { children: copy.staleBackend }) })) : status === 'hatching' ? (_jsx(HatchingView, { stage: stage })) : (status === 'preview' || status === 'adopting') && preview ? (_jsx(HatchPreview, { adopting: status === 'adopting', error: error, onAdopt: adopt, onDiscard: () => void discardHatched(requestGateway), pet: preview })) : !hasDrafts && !generating ? (_jsx(EmptyHint, { onExample: runExample })) : (_jsx(DraftGrid, { drafts: drafts, generating: generating, hasDrafts: hasDrafts, onCancel: discardDrafts, onHatch: hatch, onRemix: remixDraft, onSelect: index => $petGenSelected.set(index), selected: selected }))] }), _jsx(ConfirmDialog, { confirmLabel: copy.remix, description: copy.remixConfirmBody, onClose: () => setRemixPending(null), onConfirm: () => {
                    markRemixConfirmed();
                    if (remixPending) {
                        runRemix(remixPending);
                    }
                }, open: remixPending !== null, title: copy.remixConfirmTitle })] }));
}
