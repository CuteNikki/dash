'use server';

import { z } from 'zod';

import { record } from '@/lib/activity/record';
import { auth } from '@/lib/auth/auth';
import { tokenHash } from '@/lib/auth/invites';
import { MIN_PASSWORD } from '@/lib/auth/password';
import { ROLE_INFO, roleOf } from '@/lib/auth/roles';
import { whileCreatingAccount } from '@/lib/auth/setup';
import { db } from '@/lib/db';

const AcceptInput = z.object({
  token: z.string().regex(/^[\w-]{20,100}$/, "That invite link isn't whole"),
  name: z.string().trim().min(1, 'Enter your name').max(100),
  password: z
    .string()
    .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`)
    .max(200),
});

export type AcceptResult = { error: string } | undefined;

/**
 * Makes someone's account from their invite, and signs them in. Open to
 * whoever has the link, which is the point; it works once, for a day. The
 * invite is claimed before anything's made, so two tabs can't both use it,
 * and given back if making the account fails.
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptResult> {
  const parsed = AcceptInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { token, name, password } = parsed.data;
  const hash = tokenHash(token);
  const now = new Date();
  const claimed = await db.invite.updateMany({
    where: { tokenHash: hash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) {
    return { error: 'This invite has been used, or has run out' };
  }
  const invite = await db.invite.findUniqueOrThrow({
    where: { tokenHash: hash },
  });
  try {
    await whileCreatingAccount(
      { email: invite.email, role: roleOf(invite.role) },
      () =>
        auth.api.signUpEmail({
          body: { name, email: invite.email, password },
        })
    );
    const person = await db.user.update({
      where: { email: invite.email },
      // A mailed link reached its address, which shows it's theirs
      data: { allowedGroups: invite.groups, emailVerified: invite.emailed },
      select: { id: true, name: true },
    });
    await record(
      { user: person },
      {
        action: 'invite.accept',
        target: ROLE_INFO[roleOf(invite.role)].name,
      }
    );
  } catch (error) {
    await db.invite.update({
      where: { id: invite.id },
      data: { usedAt: null },
    });
    return { error: (error as Error).message };
  }
}
