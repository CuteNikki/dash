import { describe, expect, test } from 'bun:test';

import { newerVersion, parseVersion } from '@/lib/updates/versions';

describe('parseVersion', () => {
  test('reads a version with its prefix and suffix', () => {
    expect(parseVersion('2.11.7')).toEqual({
      prefix: '',
      numbers: [2, 11, 7],
      suffix: '',
    });
    expect(parseVersion('v0.16.26')?.prefix).toBe('v');
    expect(parseVersion('1.7.4-apache')?.suffix).toBe('-apache');
  });

  test('a tag with fewer than two numbers moves, so it is no version', () => {
    expect(parseVersion('latest')).toBeUndefined();
    expect(parseVersion('16-alpine')).toBeUndefined();
  });
});

describe('newerVersion', () => {
  test('keeps to tags of its own kind', () => {
    expect(
      newerVersion('1.7.4-apache', [
        '1.7.5-apache',
        '1.7.10-apache',
        '1.8.0-fpm',
        '1.8.0-rc1',
        '1.9',
      ])
    ).toEqual({ tag: '1.7.10-apache', major: false });
  });

  test('a new first number is a major version', () => {
    expect(newerVersion('2.11.7', ['2.12.0', '3.0.0'])).toEqual({
      tag: '3.0.0',
      major: true,
    });
  });

  test('before 1.0, the first number that is not zero counts as major', () => {
    expect(newerVersion('0.16.26', ['0.16.30', '0.17.0'])).toEqual({
      tag: '0.17.0',
      major: true,
    });
    expect(newerVersion('0.16.26', ['0.16.30'])).toEqual({
      tag: '0.16.30',
      major: false,
    });
  });

  test('nothing newer, or a prefix that differs, is no update', () => {
    expect(newerVersion('2.11.7', ['2.11.7', '2.10.0'])).toBeUndefined();
    expect(newerVersion('v1.2.3', ['1.2.4'])).toBeUndefined();
    expect(newerVersion('latest', ['1.0.0'])).toBeUndefined();
  });
});
