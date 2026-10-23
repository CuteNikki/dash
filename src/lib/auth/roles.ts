/**
 * Who may do what: each account's role, and for the roles that don't see
 * everything, the dashboard groups it sees. Shared with the browser, which
 * only hides what a role can't use; the server checks it (lib/auth/access.ts).
 */

export const ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What a role may do:
 * - users: other people's accounts and invites
 * - server: the server itself, its stats, processes, disk, updates and reboot
 * - manage: services' files, git, consoles, compose, tiles, adding services;
 *   whoever can do this can reach the whole server, as a compose file can
 *   mount its disk
 * - control: start, stop and restart a service, and apply an image's update
 * - view: a service's status, usage and logs
 */
export const ABILITIES = [
  'users',
  'server',
  'manage',
  'control',
  'view',
] as const;
export type Ability = (typeof ABILITIES)[number];

const ROLE_ABILITIES: Record<Role, readonly Ability[]> = {
  owner: ABILITIES,
  admin: ['server', 'manage', 'control', 'view'],
  operator: ['control', 'view'],
  viewer: ['view'],
};

/** How each role reads, for picking one and showing it. */
export const ROLE_INFO: Record<Role, { name: string; description: string }> = {
  owner: {
    name: 'Owner',
    description: "Everything, and other people's accounts",
  },
  admin: {
    name: 'Admin',
    description: "Everything but other people's accounts",
  },
  operator: {
    name: 'Operator',
    description: 'Logs, start, stop, restart and updates, in their groups',
  },
  viewer: {
    name: 'Viewer',
    description: 'Status, usage and logs, in their groups',
  },
};

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** A stored role as one of these; anything else counts as the least. */
export const roleOf = (value: unknown): Role =>
  isRole(value) ? value : 'viewer';

export function abilitiesOf(role: Role): readonly Ability[] {
  return ROLE_ABILITIES[role];
}

export function can(role: Role, ability: Ability) {
  return ROLE_ABILITIES[role].includes(ability);
}

/** Whether a role sees every group, rather than only the ones it's given. */
export const seesAllGroups = (role: Role) => can(role, 'manage');

/** Whether someone sees a group: every one, or one they were given. */
export function seesGroup(
  who: { role: Role; groups: readonly string[] },
  group: string
) {
  return seesAllGroups(who.role) || who.groups.includes(group);
}
