import { describe, expect, test } from 'bun:test';

import {
  abilitiesOf,
  can,
  roleOf,
  seesAllGroups,
  seesGroup,
} from '@/lib/auth/roles';

describe('roles', () => {
  test('each role may do what it says, and no more', () => {
    expect(abilitiesOf('owner')).toEqual([
      'users',
      'server',
      'manage',
      'control',
      'view',
    ]);
    expect(abilitiesOf('admin')).toEqual([
      'server',
      'manage',
      'control',
      'view',
    ]);
    expect(abilitiesOf('operator')).toEqual(['control', 'view']);
    expect(abilitiesOf('viewer')).toEqual(['view']);
  });

  test('only an owner manages people', () => {
    expect(can('owner', 'users')).toBe(true);
    expect(can('admin', 'users')).toBe(false);
  });

  test("what reaches the whole server is a full-trust role's alone", () => {
    for (const ability of ['server', 'manage'] as const) {
      expect(can('operator', ability)).toBe(false);
      expect(can('viewer', ability)).toBe(false);
    }
    expect(can('viewer', 'control')).toBe(false);
  });

  test('a role stored as anything else counts as the least', () => {
    expect(roleOf('admin')).toBe('admin');
    expect(roleOf('user')).toBe('viewer');
    expect(roleOf(null)).toBe('viewer');
    expect(roleOf('__proto__')).toBe('viewer');
  });
});

describe('groups', () => {
  test('owners and admins see every group', () => {
    expect(seesAllGroups('owner')).toBe(true);
    expect(seesAllGroups('admin')).toBe(true);
    expect(seesGroup({ role: 'admin', groups: [] }, 'Media')).toBe(true);
  });

  test('operators and viewers see only the groups they were given', () => {
    const friend = { role: 'operator' as const, groups: ['Game Servers'] };
    expect(seesGroup(friend, 'Game Servers')).toBe(true);
    expect(seesGroup(friend, 'Media')).toBe(false);
    expect(seesGroup({ role: 'viewer', groups: [] }, 'Other')).toBe(false);
  });
});
