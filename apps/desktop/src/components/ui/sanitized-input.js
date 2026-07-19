import { jsx as _jsx } from "react/jsx-runtime";
import { Input } from './input';
// An <Input> that can only ever hold a valid value: every keystroke is run
// through `sanitize`, so callers never have to validate-then-reject (a space in
// a branch name becomes "-" as you type instead of erroring at submit).
export function SanitizedInput({ value, onValueChange, sanitize, ...props }) {
    return _jsx(Input, { ...props, onChange: event => onValueChange(sanitize(event.target.value)), value: value });
}
