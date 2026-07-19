import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
export function EmbedFail({ label }) {
    return (_jsx("span", { className: "grid min-h-32 w-full place-items-center p-4", children: _jsxs("span", { className: "text-xs font-medium text-(--ui-red)", children: ["Failed to load ", label, " embed"] }) }));
}
