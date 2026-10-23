// Lists the Tailwind classes that Tailwind would write another way, e.g.
// `h-[22px]` for `h-5.5`, and fails if there are any: the suggestions the
// Tailwind editor extension makes, for every file at once. With --fix, writes
// them in. Only a suggestion that comes to the same CSS, with the theme's
// values put in, counts: the dashboard's corners follow --radius, which is only known
// in the page, so the extension's `rounded-lg` for `rounded-[4px]` isn't the
// same here. Uses Tailwind's unstable design system API, which Prettier's
// Tailwind plugin relies on too.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const root = resolve(import.meta.dirname, '..');
const css = join(root, 'src/app/globals.css');
const fix = process.argv.includes('--fix');

const source = readFileSync(css, 'utf8');
const designSystem = await __unstable__loadDesignSystem(source, {
  base: join(root, 'src/app'),
});
const scanner = new Scanner({});

/**
 * Variables the stylesheet sets itself, outside its @theme, as on :root and
 * .dark: whatever the theme says of one, the page's own value wins, so it's
 * only known there. Tailwind's theme has a --radius of 0.25rem; the dashboard's :root
 * makes it 0.5rem.
 */
const pageVariables = new Set(
  [
    ...source.replace(/@theme[^{]*\{[^}]*\}/g, '').matchAll(/(--[\w-]+)\s*:/g),
  ].map((m) => m[1])
);

/** A theme variable's value, unless the page sets it. */
function themeValue(name: string) {
  if (pageVariables.has(name)) return undefined;
  return designSystem.theme.get([name as `--${string}`]) ?? undefined;
}

/**
 * A class's CSS declarations, as written: only its innermost blocks, as its
 * selector has its own name in it, and a variant's rewrite (`order-none` as
 * `order-0`, `[&:has(…)]` as `has-[…]`) is Tailwind's to know; its values are
 * what's checked here.
 */
function declarations(candidate: string) {
  const out = designSystem.candidatesToCss([candidate])[0];
  if (!out) return undefined;
  return [...out.matchAll(/\{([^{}]*)\}/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .join(' | ');
}

/**
 * A class's CSS declarations with the theme's values put in and its sums done,
 * in px, or undefined where a value is only known in the page.
 */
function resolved(candidate: string) {
  let out = declarations(candidate);
  if (!out) return undefined;
  for (let i = 0; i < 10 && /var\(--(?!tw-)/.test(out); i++) {
    out = out.replace(/var\((--[\w-]+)\)/g, (whole, name: string) =>
      name.startsWith('--tw-') ? whole : (themeValue(name) ?? '<unknown>')
    );
  }
  if (out.includes('<unknown>') || /var\(--(?!tw-)/.test(out)) return undefined;
  out = out.replace(/(-?[\d.]+)rem/g, (_, n) => `${Number(n) * 16}px`);
  return out.replace(/calc\(([^()]*)\)/g, (whole, sum: string) => {
    const plain = sum.replace(/px/g, '');
    if (!/^[\d.\s*/+-]+$/.test(plain)) return whole;
    const value = new Function(`return ${plain}`)() as number;
    return `${Number(value.toFixed(4))}px`;
  });
}

/**
 * Whether a suggestion comes to the same as what's written: the same as it
 * stands, whatever the page's variables are, or the same once the theme's
 * values are put in.
 */
function same(written: string, suggested: string) {
  if (declarations(written) === declarations(suggested)) return true;
  const css = resolved(written);
  return css !== undefined && css === resolved(suggested);
}

const files = ['app', 'components', 'lib', 'actions'].flatMap((dir) =>
  readdirSync(join(root, 'src', dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(tsx?|css)$/.test(file) && !file.includes('generated'))
    .map((file) => join(root, 'src', dir, file))
);

let found = 0;
let kept = 0;
for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const changes: { position: number; from: string; to: string }[] = [];
  for (const { candidate, position } of scanner.getCandidatesWithPositions({
    content,
    extension: extname(file).slice(1),
  })) {
    // JavaScript's `!x`, which can look like an important class
    if (candidate.startsWith('!')) continue;
    // Words that aren't Tailwind classes at all
    if (designSystem.candidatesToCss([candidate])[0] == null) continue;
    const [canonical] = designSystem.canonicalizeCandidates([candidate], {
      rem: 16,
    });
    if (!canonical || canonical === candidate) continue;
    const line = content.slice(0, position).split('\n').length;
    const where = `${relative(root, file)}:${line}`;
    if (!same(candidate, canonical)) {
      console.log(`${where}  ${candidate}  kept: ${canonical} isn't the same`);
      kept++;
      continue;
    }
    console.log(`${where}  ${candidate}  ->  ${canonical}`);
    changes.push({ position, from: candidate, to: canonical });
    found++;
  }
  if (fix && changes.length) {
    // From the end, so each change leaves the positions before it as they were
    for (const { position, from, to } of changes.reverse()) {
      if (content.slice(position, position + from.length) !== from) continue;
      content =
        content.slice(0, position) + to + content.slice(position + from.length);
    }
    writeFileSync(file, content);
  }
}

const plural = (n: number) => `${n} ${n === 1 ? 'class' : 'classes'}`;
if (kept) console.log(`\n${plural(kept)} kept, not being the same here.`);
if (found && !fix) {
  console.error(
    `${plural(found)} Tailwind would write another way, in ${files.length} files: bun run lint:classes --fix writes them in.`
  );
  process.exit(1);
}
console.log(
  fix && found
    ? `Changed ${plural(found)}.`
    : `No classes to change, in ${files.length} files.`
);
