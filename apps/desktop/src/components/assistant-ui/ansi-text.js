import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { ansiColorClass, hasAnsiCodes, parseAnsi } from '@/lib/ansi';
import { cn } from '@/lib/utils';
/** Renders text with embedded ANSI SGR codes as colored / bold spans. Falls
 *  back to a plain string node when no codes are present so the parser cost
 *  is paid only when there's something to colorize. */
export const AnsiText = ({ className, text }) => {
    const segments = useMemo(() => (hasAnsiCodes(text) ? parseAnsi(text) : null), [text]);
    if (!segments) {
        return _jsx("span", { className: className, children: text });
    }
    return (_jsx("span", { className: className, children: segments.map((segment, index) => (_jsx("span", { className: cn(segment.bold && 'font-semibold', segment.fg && ansiColorClass(segment.fg)), children: segment.text }, `ansi-${index}`))) }));
};
