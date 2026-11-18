import { describe, expect, test } from 'bun:test';

import {
  backupExcludes,
  restoreExcludes,
  skippedIn,
} from '@/lib/backups/excludes';

const PG = '/home/nikki/services/postgres';

describe('skippedIn', () => {
  test('only the binds inside the folder', () => {
    expect(
      skippedIn(PG, [
        `${PG}/data`,
        '/home/nikki/services/postgres-other/data',
        PG,
        '/docker/config',
      ])
    ).toEqual([`${PG}/data`]);
  });
});

describe('backupExcludes', () => {
  test('what is rebuilt, and the skipped folders by their full path', () => {
    expect(backupExcludes([`${PG}/data`])).toBe(
      `--exclude-caches --exclude node_modules --exclude .next --exclude '${PG}/data'`
    );
  });
});

describe('restoreExcludes', () => {
  test('the skipped folders relative to the folder restored, so --delete leaves them', () => {
    expect(restoreExcludes(PG, [`${PG}/data`, `${PG}/a b/c'd`])).toBe(
      `--exclude node_modules --exclude .next --exclude '/data' --exclude '/a b/c'\\''d'`
    );
  });
});
