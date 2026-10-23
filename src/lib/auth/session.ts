import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db';

/**
 * The signed-in user, checked against the database, or undefined. What they
 * may do is lib/auth/access.ts's.
 */
export async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

export async function hasAccount() {
  return (await db.user.count()) > 0;
}
