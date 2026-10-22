'use client';

import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
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

/** Changes, as the theme's colors for taking away and adding, faintly. */
const tint = (color: string, percent: number) =>
  `color-mix(in oklch, var(${color}) ${percent}%, transparent)`;

/**
 * The two sides' changes in the theme's colors: lines tinted, the changed
 * text in them more so. Doubled classes outrank the package's own, which it
 * keys to light and dark.
 */
const splitTheme = EditorView.theme({
  '&.cm-merge-a.cm-merge-a .cm-changedLine, &.cm-merge-a .cm-deletedChunk': {
    backgroundColor: tint('--destructive', 12),
  },
  '&.cm-merge-b.cm-merge-b .cm-changedLine': {
    backgroundColor: tint('--success', 12),
  },
  '&.cm-merge-a.cm-merge-a .cm-changedText': {
    background: tint('--destructive', 30),
  },
  '&.cm-merge-b.cm-merge-b .cm-changedText': {
    background: tint('--success', 30),
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
});

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
