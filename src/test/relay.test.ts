import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { Container } from '@/lib/docker/docker';
import { formatDuration } from '@/lib/format';

/** The status file the relay is taken to have written, for each test to set */
let file: object = {};

// The relay's status, as `cat` in its container would give it
const actual = await import('@/lib/apps/app');
mock.module('@/lib/apps/app', () => ({
  ...actual,
  run: async () => JSON.stringify(file),
}));
const { relay } = await import('@/lib/apps/relay');

const app = { container: {} as Container, url: '' };

/** Live, with YouTube sending and Twitch failing */
function live() {
  return {
    live: true,
    since: Date.now() - 90_000,
    input: { video: 'h264, 2560x1440, 60 fps', audio: 'aac, 48000 Hz, stereo' },
    fps: 60,
    bitrate: '16000.2kbits/s',
    speed: '1x',
    droppedFrames: 0,
    outputs: [
      {
        name: 'YouTube',
        sends: 'as it comes in',
        state: 'live',
        fps: 60,
        bitrate: '16000.2kbits/s',
        speed: '1x',
        retries: 0,
      },
      {
        name: 'Twitch',
        sends: '1080p at 6000 kb/s',
        state: 'retrying',
        retries: 2,
        lastError: 'Connection refused',
      },
    ],
    problems: [],
    updatedAt: Date.now(),
  };
}

describe('relay', () => {
  beforeEach(() => {
    file = live();
  });

  test('says on its tile which platform is failing while live', async () => {
    const stats = await relay.read(app);
    expect(stats[0]).toEqual({ value: 'live', tone: 'live' });
    expect(stats).toContainEqual({ label: 'Out', value: '16.0 Mb/s' });
    expect(stats).toContainEqual({ label: 'Retrying', value: 'Twitch' });
  });

  test("says nothing's retrying when every platform is sending", async () => {
    file = {
      ...live(),
      outputs: [live().outputs[0]],
    };
    const stats = await relay.read(app);
    expect(stats.some((s) => s.label === 'Retrying')).toBe(false);
  });

  test('says on its tile, and in its window, that OBS has dropped out', async () => {
    file = { ...live(), fallbackSince: Date.now() - 75_000 };
    const stats = await relay.read(app);
    expect(stats).toContainEqual({
      label: 'Fallback',
      value: formatDuration(75),
    });
    const [facts] = await relay.details!(app);
    if (facts.kind !== 'facts') throw new Error('expected facts');
    expect(facts.facts.map((f) => f.label)).toContain('OBS dropped out');
  });

  test('is offline once the status has gone stale', async () => {
    file = { ...live(), updatedAt: Date.now() - 60_000 };
    expect(await relay.read(app)).toEqual([{ value: 'offline', tone: 'off' }]);
  });

  test('shows each platform, how it is doing, and why one failed', async () => {
    const [, table] = await relay.details!(app);
    if (table.kind !== 'table') throw new Error('expected a table');
    expect(table.columns.map((c) => c.label)).toEqual([
      'Where',
      'What',
      'State',
      'Frame rate',
      'Bitrate',
      'Keeping up',
      'Restarts',
      'Last error',
    ]);
    expect(table.rows[0]).toEqual({
      cells: [
        'YouTube',
        'as it comes in',
        'Sending',
        '60',
        '16.0 Mb/s',
        '1x',
        '0',
        '',
      ],
      dim: false,
    });
    expect(table.rows[1]).toEqual({
      cells: [
        'Twitch',
        '1080p at 6000 kb/s',
        'Retrying',
        '–',
        '–',
        '–',
        '2',
        'Connection refused',
      ],
      dim: true,
    });
  });

  test('leaves out the last error column when nothing has failed', async () => {
    file = { ...live(), outputs: [live().outputs[0]] };
    const [, table] = await relay.details!(app);
    if (table.kind !== 'table') throw new Error('expected a table');
    expect(table.columns.map((c) => c.label)).not.toContain('Last error');
  });

  test("lists the relay's own problems with the stream", async () => {
    file = {
      ...live(),
      live: false,
      problems: ["MediaMTX turned the relay's password away (HTTP 401)"],
    };
    const [facts] = await relay.details!(app);
    if (facts.kind !== 'facts') throw new Error('expected facts');
    expect(facts.facts).toContainEqual({
      label: 'Problem',
      value: "MediaMTX turned the relay's password away (HTTP 401)",
    });
  });

  test('reads a status from before platforms had states', async () => {
    file = {
      live: false,
      input: {},
      outputs: [{ name: 'YouTube', sends: 'as it comes in' }],
      updatedAt: Date.now(),
    };
    const [, table] = await relay.details!(app);
    if (table.kind !== 'table') throw new Error('expected a table');
    expect(table.rows[0].cells.slice(0, 3)).toEqual([
      'YouTube',
      'as it comes in',
      'Waiting',
    ]);
  });
});
