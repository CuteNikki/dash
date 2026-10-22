'use client';

import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
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

/** Drawn with the page's own colors, so it follows the theme. */
const theme = EditorView.theme({
  '&': {
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

/** Each kind of code in its own muted color, from the theme's --syntax tokens. */
const highlight = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
      tags.definitionKeyword,
    ],
    color: 'var(--syntax-keyword)',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.url],
    color: 'var(--syntax-string)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: 'var(--syntax-number)',
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.propertyName,
      tags.definition(tags.propertyName),
      tags.attributeName,
    ],
    color: 'var(--syntax-function)',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.tagName],
    color: 'var(--syntax-type)',
  },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  // Markdown
  { tag: tags.heading, color: 'var(--syntax-keyword)', fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.link, color: 'var(--syntax-function)' },
  { tag: tags.monospace, color: 'var(--syntax-string)' },
  // Diffs: what was added and taken away, in the colors that mean it
  { tag: tags.inserted, color: 'var(--success)' },
  { tag: tags.deleted, color: 'var(--destructive)' },
  {
    tag: [tags.meta, tags.processingInstruction],
    color: 'var(--muted-foreground)',
  },
]);

/** Filling the box it's in, scrolling inside it. */
const fill = EditorView.theme({ '&': { height: '100%' } });

/** How a file is read, from its name; anything else is plain text. */
function languageFor(name: string): Extension[] {
  const lower = name.toLowerCase();
  if (/\.ya?ml$/.test(lower)) return [yaml()];
  if (/\.json$/.test(lower)) return [json()];
  if (/\.(ts|mts|cts)$/.test(lower)) return [javascript({ typescript: true })];
  if (/\.tsx$/.test(lower))
    return [javascript({ typescript: true, jsx: true })];
  if (/\.(js|mjs|cjs|jsx)$/.test(lower)) return [javascript({ jsx: true })];
  if (/\.(md|markdown)$/.test(lower)) return [markdown()];
  if (/\.(css|scss)$/.test(lower)) return [css()];
  if (/\.html?$/.test(lower)) return [html()];
  if (/\.py$/.test(lower)) return [python()];
  if (/\.sql$/.test(lower)) return [sql()];
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

/**
 * The page's colors and a file's highlighting, as every editor here has them,
 * the side-by-side diff's included.
 */
export function codeLooks(fileName: string): Extension[] {
  return [theme, syntaxHighlighting(highlight), ...languageFor(fileName)];
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
      theme={fill}
      height='100%'
      className='h-full overflow-hidden rounded-lg font-mono text-xs/relaxed'
      aria-label={label}
      editable={!readOnly}
      // Where the cursor is only matters to editing
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
      }}
      extensions={[
        ...codeLooks(fileName),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ]}
    />
  );
}
