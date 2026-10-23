import { describe, expect, test } from 'bun:test';

import {
  formatAddress,
  formatBytes,
  formatDuration,
  imageName,
  splitAddress,
} from '@/lib/format';
import { hostOf } from '@/lib/ports';

describe('formatBytes', () => {
  test('counts in powers of 1024, with a decimal below ten', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 ** 3)).toBe('20 GB');
  });
});

describe('formatDuration', () => {
  test('in its two largest units', () => {
    expect(formatDuration(231946)).toBe('2 days 16 h');
    expect(formatDuration(3700)).toBe('1 h 1 min');
    expect(formatDuration(59)).toBe('0 min');
  });
});

describe('imageName', () => {
  test('without registry, owner, tag or digest', () => {
    expect(imageName('lscr.io/linuxserver/sonarr:latest')).toBe('sonarr');
    expect(imageName('postgres@sha256:abc')).toBe('postgres');
  });
});

describe('addresses', () => {
  test('a label is what comes before ": "', () => {
    expect(splitAddress('Java: mc.example.com:25565')).toEqual({
      label: 'Java',
      address: 'mc.example.com:25565',
    });
    expect(splitAddress('mc.example.com:25565')).toEqual({
      address: 'mc.example.com:25565',
    });
  });

  test('a link shows without its scheme', () => {
    expect(formatAddress('Site: https://dash.example.com/')).toBe(
      'dash.example.com'
    );
  });

  test('the host of an address, for its ports', () => {
    expect(hostOf('mc.example.com:25565')).toBe('mc.example.com');
    expect(hostOf(':19132')).toBe('');
    expect(hostOf('https://dash.example.com/x')).toBe('dash.example.com');
    expect(hostOf('[::1]:80')).toBe('::1');
  });
});
