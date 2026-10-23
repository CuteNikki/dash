'use client';

import { syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';

import { highlight, languageFor } from '@/components/editor/highlighting';

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

/** Filling the box it's in, scrolling inside it. */
const fill = EditorView.theme({ '&': { height: '100%' } });

/**
 * The page's colors and a file's highlighting, as every editor here has them,
 * the side-by-side diff's included.
 */
export function codeLooks(fileName: string): Extension[] {
  const language = languageFor(fileName);
  return [
    theme,
    syntaxHighlighting(highlight),
    ...(language ? [language] : []),
  ];
}

export function CodeEditor({
  value,
  onChangeAction,
  fileName,
  label,
  readOnly,
}: {
  value: string;
  onChangeAction?: (value: string) => void;
  /** Picks how it's highlighted: YAML, JSON, Dockerfile, shell, TOML, .env, diff */
  fileName: string;
  /** What's being edited, for screen readers */
  label: string;
  /** For showing text, such as a diff, rather than editing it */
  readOnly?: boolean;
}) {
  // The same each render, as CodeMirror reconfigures for a new array
  const extensions = useMemo(
    () => [
      ...codeLooks(fileName),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
    ],
    [fileName, readOnly]
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChangeAction}
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
      extensions={extensions}
    />
  );
}
