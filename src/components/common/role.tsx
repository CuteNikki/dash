'use client';

import { createContext, useContext } from 'react';

import { can, type Ability, type Role } from '@/lib/auth/roles';

/**
 * Whoever's signed in's role, for hiding what they can't use. Only that: the
 * server refuses it anyway (lib/auth/access.ts).
 */
const RoleContext = createContext<Role>('viewer');

export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  return <RoleContext value={role}>{children}</RoleContext>;
}

/** Whether whoever's signed in may do this, to show it or not. */
export function useCan() {
  const role = useContext(RoleContext);
  return (ability: Ability) => can(role, ability);
}
