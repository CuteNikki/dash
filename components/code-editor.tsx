'use client';

import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';

/**
 * Drawn with the page's own colors, so it follows the theme: quiet like the
 * rest of the dashboard, with keys and keywords in the text color, values a
 * little softer and comments faint.
 */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'inherit',
    color: 'var(--foreground)',
    backgroundColor: 'var(--muted)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: 'inherit' },
  '.cm-gutters': {
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--muted)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 5%, transparent)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  // A tint of the text color, so selected text stays readable in either theme.
  // The focused selector matches CodeMirror's own, which is otherwise lavender.
  '.cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 12%, transparent)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 20%, transparent)',
  },
});

const highlight = HighlightStyle.define([
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName)],
    color: 'var(--foreground)',
  },
  {
    tag: [tags.string, tags.number, tags.bool, tags.null, tags.content],
    color: 'var(--muted-foreground)',
  },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  // Dockerfile instructions and shell words: the text color, a little bolder
  { tag: tags.keyword, color: 'var(--foreground)', fontWeight: '600' },
  // Diffs: what was added and taken away, in the colors that mean it
  { tag: tags.inserted, color: 'var(--success)' },
  { tag: tags.deleted, color: 'var(--destructive)' },
  { tag: tags.meta, color: 'var(--muted-foreground)' },
]);

/** How a file is read, from its name; anything else is plain text. */
function languageFor(name: string): Extension[] {
  const lower = name.toLowerCase();
  if (/\.ya?ml$/.test(lower)) return [yaml()];
  if (/\.json$/.test(lower)) return [json()];
  if (/^dockerfile|\.dockerfile$/.test(lower)) {
    return [StreamLanguage.define(dockerFile)];
  }
  if (/\.(sh|bash)$/.test(lower)) return [StreamLanguage.define(shell)];
  if (/\.toml$/.test(lower)) return [StreamLanguage.define(toml)];
  if (/\.(diff|patch)$/.test(lower)) return [StreamLanguage.define(diff)];
  if (/^\.env|\.(env|properties|conf|ini)$/.test(lower)) {
    return [StreamLanguage.define(properties)];
  }
  return [];
}

export function CodeEditor({
  value,
  onChange,
  fileName,
  label,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  /** Picks how it's highlighted: YAML, JSON, Dockerfile, shell, TOML, .env, diff */
  fileName: string;
  /** What's being edited, for screen readers */
  label: string;
  /** For showing text, such as a diff, rather than editing it */
  readOnly?: boolean;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      height='100%'
      className='h-full overflow-hidden rounded-lg font-mono text-xs/relaxed'
      aria-label={label}
      editable={!readOnly}
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly }}
      extensions={[
        syntaxHighlighting(highlight),
        ...languageFor(fileName),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ]}
    />
  );
}
