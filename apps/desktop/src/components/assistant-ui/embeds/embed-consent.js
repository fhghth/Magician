'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { SplitButton } from '@/components/ui/split-button';
import { Play } from '@/lib/icons';
import { allowProvider } from '@/store/embed-consent';
// Privacy placeholder shown before an embed reaches out to a third party. Sized
// to the embed's footprint (no layout shift). The split control mirrors the
// commit button: primary "Load" (this embed) with a caret for "Always allow
// <service>" (persisted). Global off lives in Appearance settings.
export function EmbedFacade({ descriptor, onLoad }) {
    const [choice, setChoice] = useState('once');
    const style = descriptor.aspectRatio
        ? { aspectRatio: descriptor.aspectRatio }
        : { height: descriptor.height ?? 320 };
    const actions = [
        { id: 'once', label: `Load ${descriptor.label}` },
        { id: 'always', label: `Always allow ${descriptor.label}` }
    ];
    return (_jsxs("span", { className: "flex size-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary)/30", style: style, children: [_jsx(SplitButton, { actions: actions, onTrigger: id => (id === 'always' ? allowProvider(descriptor.provider) : onLoad()), onValueChange: setChoice, primaryIcon: _jsx(Play, { className: "size-3 translate-x-px fill-current" }), value: choice }), _jsx("span", { className: "text-[0.6875rem] text-(--ui-text-tertiary)", children: hostOf(descriptor) })] }));
}
function hostOf(descriptor) {
    // x.com posts often arrive as twitter.com links — show the current brand.
    if (descriptor.provider === 'twitter') {
        return 'x.com';
    }
    try {
        return new URL(descriptor.sourceUrl).hostname.replace(/^www\./, '');
    }
    catch {
        return descriptor.label;
    }
}
