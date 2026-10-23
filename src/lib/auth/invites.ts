import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { roleOf } from '@/lib/auth/roles';
import { db } from '@/lib/db';

/** How long an invite's link works for. */
export const INVITE_MS = 24 * 60 * 60 * 1000;

/** A new invite's token, for its link: 256 random bits, past guessing. */
export const newToken = () => randomBytes(32).toString('base64url');

/** What's kept of a token: its hash, so the link can't be read back out. */
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** An invite that can still be used, by its link's token; undefined if none. */
export async function openInvite(token: string) {
  if (!/^[\w-]{20,100}$/.test(token)) return undefined;
  const invite = await db.invite.findUnique({
    where: { tokenHash: tokenHash(token) },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
    return undefined;
  }
  return { ...invite, role: roleOf(invite.role) };
}
