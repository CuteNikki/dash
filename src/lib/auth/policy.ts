import 'server-only';

import type { Role } from '@/lib/auth/roles';
import { db } from '@/lib/db';

/** Whether a role's accounts need a second factor, as an owner set it. */
export async function requiresTwoFactor(role: Role) {
  const policy = await db.rolePolicy.findUnique({ where: { role } });
  return policy?.requireTwoFactor ?? false;
}

/** The roles whose accounts need a second factor. */
export async function rolesRequiringTwoFactor(): Promise<Role[]> {
  const policies = await db.rolePolicy.findMany({
    where: { requireTwoFactor: true },
    select: { role: true },
  });
  return policies.map((p) => p.role as Role);
}
