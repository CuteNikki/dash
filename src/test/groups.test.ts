import { describe, expect, test } from 'bun:test';

import { dropRow, HEADING } from '@/lib/dashboard/groups';

// Two groups: Media (jellyfin, seerr), then Games (minecraft, hytale)
const rows = [
  HEADING + 'Media',
  'jellyfin',
  'seerr',
  HEADING + 'Games',
  'minecraft',
  'hytale',
];
const order = (m: Map<string, string[]>) => Object.fromEntries(m);

describe('dropping a row in the list', () => {
  test('on a row in its own group, it takes that row’s place', () => {
    expect(order(dropRow(rows, 'seerr', 'jellyfin'))).toEqual({
      Media: ['seerr', 'jellyfin'],
      Games: ['minecraft', 'hytale'],
    });
    expect(order(dropRow(rows, 'jellyfin', 'seerr'))).toEqual({
      Media: ['seerr', 'jellyfin'],
      Games: ['minecraft', 'hytale'],
    });
  });

  test('on a row in another group, it joins that group there', () => {
    expect(order(dropRow(rows, 'jellyfin', 'hytale'))).toEqual({
      Media: ['seerr'],
      Games: ['minecraft', 'hytale', 'jellyfin'],
    });
    expect(order(dropRow(rows, 'hytale', 'seerr'))).toEqual({
      Media: ['jellyfin', 'hytale', 'seerr'],
      Games: ['minecraft'],
    });
  });

  test('on a heading from below, it goes last in the group above', () => {
    expect(order(dropRow(rows, 'hytale', HEADING + 'Games'))).toEqual({
      Media: ['jellyfin', 'seerr', 'hytale'],
      Games: ['minecraft'],
    });
  });

  test('on a heading from above, it goes first in that group', () => {
    expect(order(dropRow(rows, 'jellyfin', HEADING + 'Games'))).toEqual({
      Media: ['seerr'],
      Games: ['jellyfin', 'minecraft', 'hytale'],
    });
  });

  test('on the first heading, it stays first in the first group', () => {
    expect(order(dropRow(rows, 'minecraft', HEADING + 'Media'))).toEqual({
      Media: ['minecraft', 'jellyfin', 'seerr'],
      Games: ['hytale'],
    });
  });

  test('the last row of a group can leave it empty', () => {
    const two = [HEADING + 'A', 'a', HEADING + 'B', 'b'];
    expect(order(dropRow(two, 'a', 'b'))).toEqual({ A: [], B: ['b', 'a'] });
  });
});
