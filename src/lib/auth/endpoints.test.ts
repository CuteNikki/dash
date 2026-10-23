import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * Every route handler and server action checks who's asking before it does
 * anything, through lib/auth/access.ts, so one added later can't forget to.
 * Read from the source, as each is a door into the server.
 */
const src = join(import.meta.dirname, '../..');

/** What counts as checking. */
const CHECKS = [
  'denied(',
  'serviceForRoute(',
  'serviceForAction(',
  'requireAccess(',
  'getAccess(',
];

/** Helpers that check on their callers' behalf, by file. */
const CHECKING_HELPERS: Record<string, string[]> = {
  'actions/files.ts': ['onStack('],
  'actions/git.ts': ['repoOf('],
};

/** Doors meant for whoever isn't signed in yet. */
const OPEN = new Set([
  'actions/setup.ts:createAccount',
  'actions/invites.ts:acceptInvite',
]);

/** Each exported function in a file, with its body up to the next export. */
function exported(text: string) {
  const parts = text.split(/\nexport (?=async function|function)/).slice(1);
  return parts.map((part) => ({
    name: part.match(/function\s+(\w+)/)?.[1] ?? '?',
    body: part,
  }));
}

function files(dir: string, name: (file: string) => boolean): string[] {
  return readdirSync(join(src, dir), { recursive: true, encoding: 'utf8' })
    .filter(name)
    .map((file) => join(dir, file));
}

const doors = [
  ...files('app/api', (f) => f.endsWith('route.ts')).filter(
    (f) => !f.includes('api/auth')
  ),
  ...files('actions', (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')),
];

describe('every route and action checks access', () => {
  test.each(doors)('%s', (file) => {
    const text = readFileSync(join(src, file), 'utf8');
    const rel = relative(src, join(src, file));
    const helpers = CHECKING_HELPERS[rel] ?? [];
    // A helper that checks for others checks itself
    for (const helper of helpers) {
      const name = helper.slice(0, -1);
      const body = text.slice(text.indexOf(`function ${name}(`));
      expect(CHECKS.some((c) => body.split('\n}')[0].includes(c))).toBe(true);
    }
    const unchecked = exported(text)
      .filter(({ name }) => !OPEN.has(`${rel}:${name}`))
      .filter(
        ({ body }) => ![...CHECKS, ...helpers].some((c) => body.includes(c))
      )
      .map(({ name }) => name);
    expect(unchecked).toEqual([]);
  });
});
