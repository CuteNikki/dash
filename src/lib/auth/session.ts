import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth/auth';
import { db } from '@/lib/db';

/** The signed-in user, checked against the database, or undefined. */
export async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user;
}

/** For pages and actions: the signed-in user, or off to the sign-in page. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

/** For API routes: a 401 response when nobody is signed in. */
export async function unauthorized() {
  return (await getUser())
    ? undefined
    : Response.json({ error: 'Sign in first' }, { status: 401 });
}

export async function hasAccount() {
  return (await db.user.count()) > 0;
}
