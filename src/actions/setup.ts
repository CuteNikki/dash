'use server';

import { z } from 'zod';

import { auth } from '@/lib/auth/auth';
import { hasAccount } from '@/lib/auth/session';
import { isSetupCode, whileCreatingAccount } from '@/lib/auth/setup';

const MIN_PASSWORD = 12;

const SetupInput = z.object({
  code: z.string().min(1, 'Enter the setup code'),
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.email('Enter an email address'),
  password: z
    .string()
    .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`),
});

export type SetupResult = { error: string } | undefined;

/** Makes the dashboard's first account, its owner, and signs it in. */
export async function createAccount(
  input: z.input<typeof SetupInput>
): Promise<SetupResult> {
  const parsed = SetupInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await hasAccount())
    return { error: 'This dashboard already has its owner.' };
  if (!isSetupCode(parsed.data.code)) {
    return { error: "That's not the code from the server's log." };
  }
  const { name, email, password } = parsed.data;
  try {
    await whileCreatingAccount({ email, role: 'owner', first: true }, () =>
      auth.api.signUpEmail({ body: { name, email, password } })
    );
  } catch (error) {
    return { error: (error as Error).message };
  }
}
