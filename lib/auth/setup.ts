import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Characters in the setup code, five bits each: 100 bits, past guessing. */
const CODE_LENGTH = 20;
/** Base32's letters and digits, which leave out 0 and 1 to mistake for O and I. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Printed in groups of four, to copy from the log without losing one's place. */
const GROUP = 4;

type SetupState = { code?: string; email?: string };

// One code per server start, kept across development's hot reloads
const state: SetupState = ((
  globalThis as typeof globalThis & { dashSetup?: SetupState }
).dashSetup ??= {});

/**
 * The code /setup asks for before making the account. It's only printed in
 * the server's log, so only someone who can read that can claim a new
 * dashboard, not whoever finds the page first.
 */
export function setupCode() {
  if (!state.code) {
    // 256 is a multiple of 32, so each byte picks a character as evenly
    state.code = Array.from(
      randomBytes(CODE_LENGTH),
      (byte) => ALPHABET[byte % ALPHABET.length]
    ).join('');
    const grouped = state.code.match(new RegExp(`.{1,${GROUP}}`, 'g'))!;
    console.log(
      `\n  No account yet. Make one at /setup with this code: ${grouped.join('-')}\n`
    );
  }
  return state.code;
}

/** Whether this is the code, as typed: its dashes, spaces and case aside. */
export function isSetupCode(input: string) {
  const expected = Buffer.from(setupCode());
  const given = Buffer.from(input.replace(/[\s-]/g, '').toUpperCase());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Lets Better Auth make the user with this email while `create` runs, and
 * no other: sign-up over HTTP is turned off, and this is what's left should
 * another way to it turn up. One at a time, and the code is used up either way.
 */
export async function whileCreatingAccount<T>(
  email: string,
  create: () => Promise<T>
) {
  if (state.email) throw new Error('The account is being made already.');
  // As Better Auth stores it
  state.email = email.toLowerCase();
  try {
    return await create();
  } finally {
    state.email = undefined;
    state.code = undefined;
  }
}

/** The email of the account being made on /setup, if it's being made now. */
export function accountBeingCreated() {
  return state.email;
}
