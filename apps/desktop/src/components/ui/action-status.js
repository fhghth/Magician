import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Loader2 } from '@/lib/icons';
// idle → saving → done label+icon for action buttons (create / rename / delete…).
export function ActionStatus({ state, idle, busy, done, idleIcon = null }) {
    return (_jsxs(_Fragment, { children: [state === 'saving' ? _jsx(Loader2, { className: "animate-spin" }) : state === 'done' ? _jsx(Check, {}) : idleIcon, state === 'saving' ? busy : state === 'done' ? done : idle] }));
}
