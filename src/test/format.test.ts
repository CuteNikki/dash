import { describe, expect, test } from 'bun:test';

import {
  formatAddress,
  formatBytes,
  formatDuration,
  formatUptime,
  imageName,
  splitAddress,
} from '@/lib/format';
import { hostOf } from '@/lib/ports';
import { lastMinutes } from '@/lib/recent';

import { stackImagePath } from '@/components/editor/markdown-preview';

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

describe('formatUptime', () => {
  test('is 100% only when every check answered', () => {
    expect(formatUptime(1)).toBe('100%');
    expect(formatUptime(0.99999)).toBe('99.99%');
    expect(formatUptime(43199 / 43200)).toBe('99.99%');
  });
  test('cuts down rather than rounding up', () => {
    expect(formatUptime(0.99996)).toBe('99.99%');
    expect(formatUptime(0.5)).toBe('50.00%');
    expect(formatUptime(0)).toBe('0.00%');
  });
});

describe('lastMinutes', () => {
  const now = 1_000_000_000;
  const min = 60_000;
  test('keeps only the last ten minutes, every list alike', () => {
    const kept = lastMinutes(
      {
        at: [now - 13 * min, now - 11 * min, now - 9 * min, now - min],
        cpu: [1, 2, 3, 4],
        cores: [
          [1, 2, 3, 4],
          [3, 4],
        ],
      },
      now
    );
    expect(kept).toEqual({
      at: [now - 9 * min, now - min],
      cpu: [3, 4],
      cores: [
        [3, 4],
        [3, 4],
      ],
    });
  });
  test('keeps nothing once every reading is older', () => {
    expect(lastMinutes({ at: [now - 20 * min], cpu: [1] }, now)).toEqual({
      at: [],
      cpu: [],
    });
  });
});

describe('stackImagePath', () => {
  test("finds a picture from the file's folder, as GitHub does", () => {
    expect(stackImagePath('docs/a.png', 'README.md')).toBe('docs/a.png');
    expect(stackImagePath('docs/a.png', 'app/README.md')).toBe(
      'app/docs/a.png'
    );
    expect(stackImagePath('../a.png', 'app/docs/x.md')).toBe('app/a.png');
    expect(stackImagePath('./a.png?raw=1', 'app/x.md')).toBe('app/a.png');
  });
  test("goes from the stack's folder for a path from its root", () => {
    expect(stackImagePath('/docs/a.png', 'app/README.md')).toBe('docs/a.png');
  });
  test('leaves web addresses and the like as they are', () => {
    expect(
      stackImagePath('https://img.shields.io/x.svg', 'README.md')
    ).toBeUndefined();
    expect(
      stackImagePath('//cdn.example.com/a.png', 'README.md')
    ).toBeUndefined();
    expect(
      stackImagePath('data:image/png;base64,AAAA', 'README.md')
    ).toBeUndefined();
  });
});
