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
  LanguageSupport,
  StreamLanguage,
} from '@codemirror/language';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { highlightCode, tags } from '@lezer/highlight';
import { useInsertionEffect } from 'react';
import { StyleModule } from 'style-mod';

/** Each kind of code in its own muted color, from the theme's --syntax tokens. */
export const highlight = HighlightStyle.define([
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

/** How a file is read, from its name; undefined for plain text. */
export function languageFor(
  name: string
): LanguageSupport | StreamLanguage<unknown> | undefined {
  const lower = name.toLowerCase();
  if (/\.ya?ml$/.test(lower)) return yaml();
  if (/\.json$/.test(lower)) return json();
  if (/\.(ts|mts|cts)$/.test(lower)) return javascript({ typescript: true });
  if (/\.tsx$/.test(lower)) return javascript({ typescript: true, jsx: true });
  if (/\.(js|mjs|cjs|jsx)$/.test(lower)) return javascript({ jsx: true });
  if (/\.(md|markdown)$/.test(lower)) return markdown();
  if (/\.(css|scss)$/.test(lower)) return css();
  if (/\.html?$/.test(lower)) return html();
  if (/\.py$/.test(lower)) return python();
  if (/\.sql$/.test(lower)) return sql();
  if (/^dockerfile|\.dockerfile$/.test(lower)) {
    return StreamLanguage.define(dockerFile);
  }
  if (/\.(sh|bash)$/.test(lower)) return StreamLanguage.define(shell);
  if (/\.toml$/.test(lower)) return StreamLanguage.define(toml);
  if (/\.(diff|patch)$/.test(lower)) return StreamLanguage.define(diff);
  if (/^\.env|\.(env|properties|conf|ini)$/.test(lower)) {
    return StreamLanguage.define(properties);
  }
  return undefined;
}

/**
 * A Markdown code block's language, as named after its ```, as the name of a
 * file of that kind; most are their own extension: ts, yaml, json, sql.
 */
const FENCE_FILES: Record<string, string> = {
  typescript: 'x.ts',
  javascript: 'x.js',
  python: 'x.py',
  yml: 'x.yaml',
  markdown: 'x.md',
  shell: 'x.sh',
  zsh: 'x.sh',
  console: 'x.sh',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  dotenv: '.env',
  env: '.env',
  jsonc: 'x.json',
};

/**
 * A code block's text, colored as its language is in the editor, each
 * token a span; plain text for a language it doesn't know.
 */
export function HighlightedCode({
  text,
  language,
}: {
  text: string;
  language: string;
}) {
  // The colors' rules, which an editor puts on the page, for when none has
  useInsertionEffect(() => {
    if (highlight.module) StyleModule.mount(document, highlight.module);
  }, []);
  const lower = language.toLowerCase();
  const found = languageFor(FENCE_FILES[lower] ?? `x.${lower}`);
  if (!found) return text;
  const parser =
    found instanceof LanguageSupport ? found.language.parser : found.parser;
  const parts: React.ReactNode[] = [];
  highlightCode(
    text,
    parser.parse(text),
    highlight,
    (code, classes) =>
      parts.push(
        classes ? (
          <span key={parts.length} className={classes}>
            {code}
          </span>
        ) : (
          code
        )
      ),
    () => parts.push('\n')
  );
  return parts;
}
