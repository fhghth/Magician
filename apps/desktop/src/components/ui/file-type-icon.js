import { jsx as _jsx } from "react/jsx-runtime";
import { ToolIcon } from '@/components/ui/tool-icon';
import { codiconForFilename, codiconForLanguage } from '@/lib/markdown-code';
/**
 * Icon for a file or code language, resolved through the one mapping shared
 * with code blocks (`codiconForFilename` / `codiconForLanguage`). Renders via
 * `ToolIcon`, so it uses a filled glyph when one exists and falls back to the
 * outline codicon font otherwise. Pass a `path` for file rows or a `language`
 * for fenced code.
 */
export function FileTypeIcon({ language, path, ...props }) {
    const name = path ? codiconForFilename(path) : codiconForLanguage(language);
    return _jsx(ToolIcon, { name: name, ...props });
}
