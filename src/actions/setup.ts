'use server';

import { z } from 'zod';

import { errorText, issueText } from '@/i18n/errors';

import { auth } from '@/lib/auth/auth';
import { MIN_PASSWORD } from '@/lib/auth/password';
import { hasAccount } from '@/lib/auth/session';
import { isSetupCode, whileCreatingAccount } from '@/lib/auth/setup';

const SetupInput = z.object({
  code: z.string().min(1, 'enterSetupCode'),
  name: z.string().trim().min(1, 'enterName'),
  email: z.email('enterEmail'),
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
  if (!parsed.success)
    return { error: await issueText(parsed.error.issues[0].message) };
  if (await hasAccount()) return { error: await errorText('hasOwner') };
  if (!isSetupCode(parsed.data.code)) {
    return { error: await errorText('wrongSetupCode') };
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
