const path = 'components/code-editor.tsx';
let s = await Bun.file(path).text();
const rep = (a: string, b: string) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60));
  s = s.replace(a, b);
};
rep(
  "import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';",
  "import { diff } from '@codemirror/legacy-modes/mode/diff';\nimport { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';"
);
rep(
  "import { EditorView } from '@codemirror/view';",
  "import { EditorState } from '@codemirror/state';\nimport { EditorView } from '@codemirror/view';"
);
rep(
  "  { tag: tags.keyword, color: 'var(--foreground)', fontWeight: '600' },",
  "  { tag: tags.keyword, color: 'var(--foreground)', fontWeight: '600' },\n  // Diffs: what was added and taken away, in the colors that mean it\n  { tag: tags.inserted, color: 'var(--success)' },\n  { tag: tags.deleted, color: 'var(--destructive)' },\n  { tag: tags.meta, color: 'var(--muted-foreground)' },"
);
rep(
  '  if (/\.toml$/.test(lower)) return [StreamLanguage.define(toml)];',
  '  if (/\.toml$/.test(lower)) return [StreamLanguage.define(toml)];\n  if (/\.(diff|patch)$/.test(lower)) return [StreamLanguage.define(diff)];'
);
rep(
  '  fileName,\n  label,\n}: {\n  value: string;\n  onChange: (value: string) => void;',
  '  fileName,\n  label,\n  readOnly,\n}: {\n  value: string;\n  onChange?: (value: string) => void;\n  /** For showing text, such as a diff, rather than editing it */\n  readOnly?: boolean;'
);
rep(
  '      extensions={[syntaxHighlighting(highlight), ...languageFor(fileName)]}',
  '      editable={!readOnly}\n      extensions={[\n        syntaxHighlighting(highlight),\n        ...languageFor(fileName),\n        ...(readOnly ? [EditorState.readOnly.of(true)] : []),\n      ]}'
);
rep(
  "  /** Picks how it's highlighted: YAML, JSON, Dockerfile, shell, TOML, .env */",
  "  /** Picks how it's highlighted: YAML, JSON, Dockerfile, shell, TOML, .env, diff */"
);
await Bun.write(path, s);
