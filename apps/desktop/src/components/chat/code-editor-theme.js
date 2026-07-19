import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
const DARK = {
    comment: '#8b949e',
    constant: '#79c0ff',
    entity: '#d2a8ff',
    fg: '#e6edf3',
    keyword: '#ff7b72',
    number: '#79c0ff',
    string: '#a5d6ff',
    tag: '#7ee787',
    type: '#ffa657'
};
const LIGHT = {
    comment: '#6e7781',
    constant: '#0550ae',
    entity: '#8250df',
    fg: '#1f2328',
    keyword: '#cf222e',
    number: '#0550ae',
    string: '#0a3069',
    tag: '#116329',
    type: '#953800'
};
function makeHighlightStyle(p) {
    return HighlightStyle.define([
        { color: p.keyword, tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.moduleKeyword] },
        { color: p.string, tag: [t.string, t.special(t.string), t.attributeValue] },
        { color: p.tag, tag: [t.regexp, t.escape] },
        { color: p.comment, fontStyle: 'italic', tag: [t.comment, t.lineComment, t.blockComment, t.docComment] },
        {
            color: p.entity,
            tag: [
                t.function(t.variableName),
                t.function(t.propertyName),
                t.definition(t.function(t.variableName)),
                t.labelName
            ]
        },
        { color: p.number, tag: [t.number, t.bool, t.atom] },
        { color: p.constant, tag: [t.constant(t.variableName), t.standard(t.variableName)] },
        { color: p.type, tag: [t.typeName, t.className, t.namespace] },
        { color: p.tag, tag: [t.tagName] },
        { color: p.constant, tag: [t.attributeName, t.propertyName] },
        { color: p.fg, tag: [t.variableName] },
        { color: p.fg, tag: [t.operator, t.punctuation, t.separator, t.bracket, t.angleBracket, t.derefOperator] },
        { color: p.comment, tag: [t.meta, t.processingInstruction] },
        { color: p.constant, tag: [t.link, t.url], textDecoration: 'underline' },
        { color: p.constant, fontWeight: 'bold', tag: [t.heading] },
        { fontWeight: 'bold', tag: [t.strong] },
        { fontStyle: 'italic', tag: [t.emphasis] },
        { color: p.keyword, tag: [t.deleted, t.invalid] }
    ]);
}
const DARK_STYLE = makeHighlightStyle(DARK);
const LIGHT_STYLE = makeHighlightStyle(LIGHT);
// Editor chrome (caret, selection, active line, gutters) on a transparent
// background so the pane surface shows through, paired with the matching
// GitHub highlight style.
export function githubEditorTheme(dark) {
    const p = dark ? DARK : LIGHT;
    return [
        EditorView.theme({
            '&': { backgroundColor: 'transparent', color: p.fg },
            '&.cm-focused .cm-selectionBackground, .cm-content ::selection, .cm-selectionBackground': {
                backgroundColor: dark ? 'rgba(56,139,253,0.25)' : 'rgba(84,174,255,0.28)'
            },
            // Match the read view's gutter: dim, right-aligned line numbers.
            '.cm-content': { caretColor: p.fg },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.fg },
            '.cm-gutters': { backgroundColor: 'transparent', border: 'none' }
        }, { dark }),
        syntaxHighlighting(dark ? DARK_STYLE : LIGHT_STYLE)
    ];
}
