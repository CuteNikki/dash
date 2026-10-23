import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { Role } from '@/lib/auth/roles';

/** Characters in the setup code, five bits each: 100 bits, past guessing. */
const CODE_LENGTH = 20;
/** Base32's letters and digits, which leave out 0 and 1 to mistake for O and I. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** Printed in groups of four, to copy from the log without losing one's place. */
const GROUP = 4;

/** The one account being made now, by /setup or an invite, and its role. */
type Creating = { email: string; role: Role; first: boolean };

type SetupState = { code?: string; creating?: Creating };

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
 * Lets Better Auth make the user with this email, with this role, while
 * `create` runs, and no other: sign-up over HTTP is turned off, and this is
 * what's left should another way to it turn up. One at a time. The first
 * account, made on /setup, uses the code up either way.
 */
export async function whileCreatingAccount<T>(
  account: { email: string; role: Role; first?: boolean },
  create: () => Promise<T>
) {
  if (state.creating) throw new Error('An account is being made already.');
  // As Better Auth stores it
  state.creating = {
    email: account.email.toLowerCase(),
    role: account.role,
    first: account.first ?? false,
  };
  try {
    return await create();
  } finally {
    state.creating = undefined;
    if (account.first) state.code = undefined;
  }
}

/** The account being made now, by /setup or an invite, if one is. */
export function accountBeingCreated() {
  return state.creating;
}
