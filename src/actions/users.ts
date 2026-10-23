'use server';

import { z } from 'zod';

import { record } from '@/lib/activity/record';
import { requireAccess } from '@/lib/auth/access';
import { INVITE_MS, newToken, tokenHash } from '@/lib/auth/invites';
import { ROLE_INFO, roleOf, ROLES, type Role } from '@/lib/auth/roles';
import { groupNames } from '@/lib/dashboard/groups';
import { getDashboard } from '@/lib/dashboard/services';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/site';

/** Groups given to one person, far past any real number */
const MAX_GROUPS = 200;
const MAX_GROUP = 60;

export type Person = {
  id: string;
  name: string;
  email: string;
  role: Role;
  groups: string[];
  disabled: boolean;
  twoFactor: boolean;
  /** When they were last seen, as their newest session was */
  lastActive?: number;
  createdAt: number;
  /** Whether this is whoever's asking */
  you: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  groups: string[];
  expiresAt: number;
  invitedBy: string;
};

export type People = {
  people: Person[];
  invites: PendingInvite[];
  /** Every group there is, to give people */
  groups: string[];
};

export type PeopleResult = { error: string } | undefined;

/** Everyone with an account, the invites still open, and the groups to give. */
export async function listPeople(): Promise<People> {
  const access = await requireAccess('users');
  const [users, invites, dashboard] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        sessions: {
          select: { updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    }),
    db.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { name: true } } },
    }),
    getDashboard(access),
  ]);
  return {
    people: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: roleOf(u.role),
      groups: u.allowedGroups,
      disabled: !!u.banned,
      twoFactor: !!u.twoFactorEnabled,
      lastActive: u.sessions[0]?.updatedAt.getTime(),
      createdAt: u.createdAt.getTime(),
      you: u.id === access.user.id,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: roleOf(i.role),
      groups: i.groups,
      expiresAt: i.expiresAt.getTime(),
      invitedBy: i.invitedBy.name,
    })),
    groups: groupNames(dashboard.services, dashboard.groupOrder),
  };
}

const Access = z.object({
  role: z.enum(ROLES),
  groups: z
    .array(z.string().trim().min(1).max(MAX_GROUP))
    .max(MAX_GROUPS)
    .transform((groups) => [...new Set(groups)]),
});

/**
 * Refuses a change that would leave the dashboard with no owner: someone
 * has to be able to let people in, and take them out.
 */
async function keepsAnOwner(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return 'They no longer have an account';
  if (roleOf(user.role) !== 'owner') return undefined;
  const owners = await db.user.count({
    where: { role: 'owner', banned: { not: true } },
  });
  return owners > 1
    ? undefined
    : 'The dashboard needs an owner: make someone else one first';
}

/**
 * What someone may do, and the groups they see. It takes effect on their
 * next request, as access is read from the database each time.
 */
export async function setPersonAccess(
  userId: string,
  input: { role: Role; groups: string[] }
): Promise<PeopleResult> {
  const access = await requireAccess('users');
  const parsed = Access.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { role, groups } = parsed.data;
  if (role !== 'owner') {
    const kept = await keepsAnOwner(userId);
    if (kept) return { error: kept };
  }
  const person = await db.user.update({
    where: { id: userId },
    data: { role, allowedGroups: groups },
    select: { name: true },
  });
  await record(access, {
    action: 'person.access',
    target: person.name,
    detail: [ROLE_INFO[role].name, ...groups].join(', '),
  });
}

/**
 * Turns someone's account off, signing them out everywhere, or back on. A
 * disabled account gets no session (Better Auth's admin plugin refuses it).
 */
export async function setPersonDisabled(
  userId: string,
  disabled: boolean
): Promise<PeopleResult> {
  const access = await requireAccess('users');
  if (typeof disabled !== 'boolean') return { error: 'On or off' };
  if (disabled) {
    if (userId === access.user.id) {
      return { error: "You can't disable your own account" };
    }
    const kept = await keepsAnOwner(userId);
    if (kept) return { error: kept };
  }
  const [person] = await db.$transaction([
    db.user.update({
      where: { id: userId },
      select: { name: true },
      data: disabled
        ? { banned: true, banReason: 'Disabled by the owner' }
        : { banned: false, banReason: null, banExpires: null },
    }),
    ...(disabled ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
  await record(access, {
    action: disabled ? 'person.disable' : 'person.enable',
    target: person.name,
  });
}

/** Signs someone out on every device; they can sign in again. */
export async function signOutPerson(userId: string): Promise<PeopleResult> {
  const access = await requireAccess('users');
  if (typeof userId !== 'string') return { error: 'Who?' };
  await db.session.deleteMany({ where: { userId } });
  await record(access, {
    action: 'person.signout',
    target: (await db.user.findUnique({ where: { id: userId } }))?.name,
  });
}

/** Removes someone's account, with its passkeys, sessions and invites. */
export async function removePerson(userId: string): Promise<PeopleResult> {
  const access = await requireAccess('users');
  if (userId === access.user.id) {
    return { error: "You can't remove your own account" };
  }
  const kept = await keepsAnOwner(userId);
  if (kept) return { error: kept };
  const person = await db.user.delete({ where: { id: userId } });
  await record(access, { action: 'person.remove', target: person.name });
}

const NewInvite = Access.extend({
  email: z.email('Enter an email address').transform((e) => e.toLowerCase()),
});

export type InviteResult =
  { link: string; expiresAt: number } | { error: string };

/**
 * An invite for someone to make their account with: its link, shown this
 * once, as only its hash is kept. It works for a day, once.
 */
export async function createInvite(input: {
  email: string;
  role: Role;
  groups: string[];
}): Promise<InviteResult> {
  const access = await requireAccess('users');
  const parsed = NewInvite.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, role, groups } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    return { error: 'Someone already has an account with that email' };
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_MS);
  await db.invite.create({
    data: {
      tokenHash: tokenHash(token),
      email,
      role,
      groups,
      invitedById: access.user.id,
      expiresAt,
    },
  });
  await record(access, {
    action: 'invite.create',
    target: email,
    detail: [ROLE_INFO[role].name, ...groups].join(', '),
  });
  return {
    link: new URL(`/invite/${token}`, SITE_URL).href,
    expiresAt: expiresAt.getTime(),
  };
}

/** Takes an invite back, so its link no longer works. */
export async function revokeInvite(id: string): Promise<PeopleResult> {
  const access = await requireAccess('users');
  if (typeof id !== 'string') return { error: 'Which invite?' };
  const invite = await db.invite.findFirst({ where: { id, usedAt: null } });
  if (!invite) return;
  await db.invite.delete({ where: { id } });
  await record(access, { action: 'invite.revoke', target: invite.email });
}
