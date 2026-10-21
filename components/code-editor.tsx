'use client';

import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';

/**
 * Drawn with the page's own colors, so it follows the theme: quiet like the
 * rest of the dashboard, with the keys in the text color, values a little
 * softer and comments faint.
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
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
    {
      backgroundColor: 'color-mix(in oklch, var(--ring) 35%, transparent)',
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
]);

export function CodeEditor({
  value,
  onChange,
  language,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** YAML gets its keys and values told apart; anything else is plain text */
  language?: 'yaml';
  /** What's being edited, for screen readers */
  label: string;
}) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      height='100%'
      className='h-full overflow-hidden rounded-lg font-mono text-xs/relaxed'
      aria-label={label}
      basicSetup={{ foldGutter: false, highlightActiveLine: true }}
      extensions={[
        syntaxHighlighting(highlight),
        ...(language === 'yaml' ? [yaml()] : []),
      ]}
    />
  );
}
