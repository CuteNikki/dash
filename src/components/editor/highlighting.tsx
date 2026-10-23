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
import { useInsertionEffect, useMemo } from 'react';
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

type Language = LanguageSupport | StreamLanguage<unknown>;

/** Each kind of file, by its name in lower case, and how it's read. */
const LANGUAGES: [RegExp, () => Language][] = [
  [/\.ya?ml$/, () => yaml()],
  [/\.json$/, () => json()],
  [/\.(ts|mts|cts)$/, () => javascript({ typescript: true })],
  [/\.tsx$/, () => javascript({ typescript: true, jsx: true })],
  [/\.(js|mjs|cjs|jsx)$/, () => javascript({ jsx: true })],
  [/\.(md|markdown)$/, () => markdown()],
  [/\.(css|scss)$/, () => css()],
  [/\.html?$/, () => html()],
  [/\.py$/, () => python()],
  [/\.sql$/, () => sql()],
  [/^dockerfile|\.dockerfile$/, () => StreamLanguage.define(dockerFile)],
  [/\.(sh|bash)$/, () => StreamLanguage.define(shell)],
  [/\.toml$/, () => StreamLanguage.define(toml)],
  [/\.(diff|patch)$/, () => StreamLanguage.define(diff)],
  [
    /^\.env|\.(env|properties|conf|ini)$/,
    () => StreamLanguage.define(properties),
  ],
];

// Each made once: a stream language made again is a new one to CodeMirror,
// which reparses the file and keeps its types for good
const made = new Map<number, Language>();

/** How a file is read, from its name; undefined for plain text. */
export function languageFor(name: string): Language | undefined {
  const lower = name.toLowerCase();
  const i = LANGUAGES.findIndex(([test]) => test.test(lower));
  if (i === -1) return undefined;
  let language = made.get(i);
  if (!language) {
    language = LANGUAGES[i][1]();
    made.set(i, language);
  }
  return language;
}

/**
 * A Markdown code block's language, as named after its ```, as the name of a
 * file of that kind; most are their own extension: ts, yaml, json, sql.
 */
const FENCE_FILES = new Map([
  ['typescript', 'x.ts'],
  ['javascript', 'x.js'],
  ['python', 'x.py'],
  ['yml', 'x.yaml'],
  ['markdown', 'x.md'],
  ['shell', 'x.sh'],
  ['zsh', 'x.sh'],
  ['dockerfile', 'Dockerfile'],
  ['docker', 'Dockerfile'],
  ['dotenv', '.env'],
  ['env', '.env'],
]);

/** Whether the colors' rules are on the page yet, put there once for all. */
let mounted = false;

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
    if (mounted || !highlight.module) return;
    StyleModule.mount(document, highlight.module);
    mounted = true;
  }, []);
  return useMemo(() => {
    const lower = language.toLowerCase();
    const found = languageFor(FENCE_FILES.get(lower) ?? `x.${lower}`);
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
  }, [text, language]);
}
