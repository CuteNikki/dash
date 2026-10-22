'use client';

import { getChunks, MergeView } from '@codemirror/merge';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  lineNumbers,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';

import type { FileDiff } from '@/lib/git';

import { CodeEditor, codeLooks } from '@/components/code-editor';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type DiffLayout = 'unified' | 'split';

/** Where the layout picked last is kept, in this browser. */
const LAYOUT_KEY = 'dash.diffLayout';
/** Unchanged lines kept around each change; longer runs fold away. */
const CONTEXT_LINES = 3;
/** The fewest unchanged lines worth folding away. */
const MIN_FOLDED = 4;

/** A faint wash of a theme color. */
const tint = (color: string, percent: number) =>
  `color-mix(in oklch, var(${color}) ${percent}%, transparent)`;

/**
 * The two sides' changes in the theme's colors: lines tinted (the tints are
 * the theme's), the changed text in them more so, together no more than
 * keeps code in every syntax color at 4.5:1. Doubled classes outrank the
 * package's own, which it keys to light and dark.
 */
const splitTheme = EditorView.theme({
  '&.cm-merge-a.cm-merge-a .cm-changedLine, &.cm-merge-a .cm-deletedChunk': {
    backgroundColor: 'var(--diff-removed)',
  },
  '&.cm-merge-b.cm-merge-b .cm-changedLine': {
    backgroundColor: 'var(--diff-added)',
  },
  '&.cm-merge-a.cm-merge-a .cm-changedText': {
    background: tint('--destructive', 16),
  },
  '&.cm-merge-b.cm-merge-b .cm-changedText': {
    background: tint('--success', 16),
  },
  '&.cm-merge-a.cm-merge-a .cm-changedLineGutter': {
    background: 'var(--destructive)',
  },
  '&.cm-merge-b.cm-merge-b .cm-changedLineGutter': {
    background: 'var(--success)',
  },
  '& .cm-collapsedLines.cm-collapsedLines': {
    color: 'var(--muted-foreground)',
    background: tint('--foreground', 5),
  },
  // A rewritten chunk is all changed text; marking it word by word would only
  // stripe every line, so its lines' tint says it alone
  '&.cm-merge-a.cm-merge-a .cm-rewrittenLine .cm-changedText, &.cm-merge-b.cm-merge-b .cm-rewrittenLine .cm-changedText':
    { background: 'none' },
});

/** How much of a chunk's text can change before it counts as rewritten. */
const REWRITTEN_SHARE = 0.5;

const rewrittenLine = Decoration.line({ class: 'cm-rewrittenLine' });

/** How many characters of some text aren't spaces. */
const visible = (text: string) => text.replace(/\s/g, '').length;

/**
 * Marks the lines of each chunk that's more changed than not on this side,
 * from the merge view's own chunks, so its changes aren't marked word by word.
 */
function rewrittenLines(state: EditorState) {
  const found = getChunks(state);
  const builder = new RangeSetBuilder<Decoration>();
  if (!found?.side) return builder.finish();
  const a = found.side === 'a';
  for (const chunk of found.chunks) {
    const from = a ? chunk.fromA : chunk.fromB;
    const to = a ? chunk.toA : chunk.toB;
    const total = visible(state.doc.sliceString(from, to));
    const changed = chunk.changes.reduce(
      (sum, c) =>
        sum +
        visible(
          state.doc.sliceString(
            from + (a ? c.fromA : c.fromB),
            from + (a ? c.toA : c.toB)
          )
        ),
      0
    );
    if (!total || changed / total <= REWRITTEN_SHARE) continue;
    for (let pos = from; pos < to;) {
      const line = state.doc.lineAt(pos);
      builder.add(line.from, line.from, rewrittenLine);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const rewritten = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = rewrittenLines(view.state);
    }
    update(update: ViewUpdate) {
      if (
        getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks
      )
        this.decorations = rewrittenLines(update.state);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/** The diff layout picked last in this browser, and picking another. */
export function useDiffLayout() {
  const [layout, setLayout] = useState<DiffLayout>(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === 'split' ? 'split' : 'unified';
    } catch {
      return 'unified';
    }
  });
  function pick(next: DiffLayout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {}
  }
  return [layout, pick] as const;
}

/** Unified or side by side, for every diff in the panel. */
export function DiffLayoutToggle({
  layout,
  onPick,
}: {
  layout: DiffLayout;
  onPick: (layout: DiffLayout) => void;
}) {
  return (
    <ToggleGroup
      type='single'
      variant='outline'
      value={layout}
      // Picking the shown one again would unpick it; keep one picked
      onValueChange={(v) => v && onPick(v as DiffLayout)}
      aria-label='Show changes'
    >
      <ToggleGroupItem value='unified'>Unified</ToggleGroupItem>
      <ToggleGroupItem value='split'>Split</ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * One file's changes: as a unified diff, or side by side, the file before
 * on the left and after on the right, highlighted as its kind of file. Side
 * by side needs both whole, which a binary or very large file doesn't have,
 * so that one stays unified.
 */
export function DiffView({
  diff,
  path,
  layout,
  label,
}: {
  diff: FileDiff;
  /** The file's path, which picks its highlighting */
  path: string;
  layout: DiffLayout;
  /** What's shown, for screen readers */
  label: string;
}) {
  if (layout === 'split' && diff.sides) {
    return (
      <SplitDiff
        before={diff.sides.before}
        after={diff.sides.after}
        path={path}
        label={label}
      />
    );
  }
  return (
    <CodeEditor
      value={diff.diff}
      fileName='changes.diff'
      label={label}
      readOnly
    />
  );
}

function SplitDiff({
  before,
  after,
  path,
  label,
}: {
  before: string;
  after: string;
  path: string;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = box.current;
    if (!parent) return;
    const name = path.split('/').at(-1) ?? path;
    const side = [
      ...codeLooks(name),
      splitTheme,
      rewritten,
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    const view = new MergeView({
      a: { doc: before, extensions: side },
      b: { doc: after, extensions: side },
      parent,
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: CONTEXT_LINES, minSize: MIN_FOLDED },
    });
    return () => view.destroy();
  }, [before, after, path]);
  return (
    <div
      ref={box}
      role='region'
      aria-label={label}
      className='h-full overflow-hidden rounded-lg bg-muted font-mono text-xs/relaxed [&_.cm-mergeView]:h-full'
    />
  );
}
