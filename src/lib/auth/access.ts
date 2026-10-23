import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from '@/lib/auth/auth';
import {
  can,
  roleOf,
  seesAllGroups,
  seesGroup,
  type Ability,
  type Role,
} from '@/lib/auth/roles';
import { groupOf, serviceKey } from '@/lib/dashboard/services';
import { db } from '@/lib/db';
import { listContainers, type Container } from '@/lib/docker/docker';

/** Who's signed in, what they may do, and the groups they see. */
export type Access = {
  user: { id: string; name: string; email: string };
  role: Role;
  /** The groups they're given; every one for a role that sees all */
  groups: string[];
};

/**
 * The signed-in user's access, checked against the database, once a
 * request; undefined when nobody is. A disabled account has no session.
 */
export const getAccess = cache(async (): Promise<Access | undefined> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return undefined;
  const row = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, allowedGroups: true },
  });
  if (!row) return undefined;
  const { id, name, email } = session.user;
  return {
    user: { id, name, email },
    role: roleOf(row.role),
    groups: row.allowedGroups,
  };
});

/** What a page, action or route was refused for. */
export class AccessError extends Error {
  constructor(readonly status: 401 | 403 | 404) {
    super(
      status === 401
        ? 'Sign in first'
        : status === 404
          ? 'That no longer exists'
          : 'Your account can’t do that'
    );
  }
}

/**
 * For pages and actions: the signed-in user if they may do this, off to the
 * sign-in page when nobody is, and an error when they may not.
 */
export async function requireAccess(ability: Ability) {
  const access = await getAccess();
  if (!access) redirect('/login');
  if (!can(access.role, ability)) throw new AccessError(403);
  return access;
}

/**
 * For API routes: a 401 response when nobody is signed in, a 403 when they
 * may not do this, else undefined, to carry on.
 */
export async function denied(ability: Ability) {
  const access = await getAccess();
  if (!access) return refusal(new AccessError(401));
  if (!can(access.role, ability)) return refusal(new AccessError(403));
  return undefined;
}

export function refusal(error: AccessError) {
  return Response.json({ error: error.message }, { status: error.status });
}

/**
 * A container someone may do this to: one that exists, by its exact id, in
 * a group they see. Its group is the dashboard's own, so a check and what's
 * shown can't disagree.
 */
export async function serviceFor(
  containerId: string,
  ability: Ability
): Promise<{ access: Access; container: Container; group: string }> {
  const access = await getAccess();
  if (!access) throw new AccessError(401);
  if (!can(access.role, ability)) throw new AccessError(403);
  const container = (await listContainers()).find((c) => c.id === containerId);
  if (!container) throw new AccessError(404);
  const tile = await db.tile.findUnique({
    where: { key: serviceKey(container) },
    select: { group: true },
  });
  const group = groupOf(container, tile);
  if (!seesGroup(access, group)) throw new AccessError(404);
  return { access, container, group };
}

/** serviceFor for a route: the container, or the response refusing it. */
export async function serviceForRoute(containerId: string, ability: Ability) {
  try {
    return await serviceFor(containerId, ability);
  } catch (error) {
    if (error instanceof AccessError) return refusal(error);
    throw error;
  }
}

/**
 * serviceFor for an action: the container, or why it was refused, in words.
 * Nobody signed in goes off to the sign-in page, as requireAccess does.
 */
export async function serviceForAction(containerId: string, ability: Ability) {
  try {
    return await serviceFor(containerId, ability);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    if (error.status === 401) redirect('/login');
    return { refused: error.message };
  }
}

export { seesAllGroups, seesGroup };
