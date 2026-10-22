import 'server-only';

import { randomInt, timingSafeEqual } from 'node:crypto';

/** Digits in the setup code. */
const CODE_LENGTH = 8;

type SetupState = { code?: string; creating: boolean };

// One code per server start, kept across development's hot reloads
const state: SetupState = ((
  globalThis as typeof globalThis & { dashSetup?: SetupState }
).dashSetup ??= { creating: false });

/**
 * The code /setup asks for before making the account. It's only printed in
 * the server's log, so only someone who can read that can claim a new
 * dashboard, not whoever finds the page first.
 */
export function setupCode() {
  if (!state.code) {
    state.code = Array.from({ length: CODE_LENGTH }, () => randomInt(10)).join(
      ''
    );
    console.log(
      `\n  No account yet. Make one at /setup with this code: ${state.code}\n`
    );
  }
  return state.code;
}

export function isSetupCode(input: string) {
  const expected = Buffer.from(setupCode());
  const given = Buffer.from(input.replace(/\s/g, ''));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Lets Better Auth make a user while `create` runs; refused otherwise. */
export async function whileCreatingAccount<T>(create: () => Promise<T>) {
  state.creating = true;
  try {
    return await create();
  } finally {
    state.creating = false;
    state.code = undefined;
  }
}

export function isCreatingAccount() {
  return state.creating;
}
