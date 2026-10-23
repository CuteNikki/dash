import 'server-only';

import { run, type App } from '@/lib/apps/app';
import type { Container } from '@/lib/docker/docker';
import { formatDuration } from '@/lib/format';

/** What the relay writes about its stream, in its own repository's index.ts. */
type RelayStatus = {
  live: boolean;
  since?: number;
  input: { video?: string; audio?: string };
  fps?: number;
  bitrate?: string;
  speed?: string;
  droppedFrames?: number;
  outputs: { name: string; sends: string }[];
  updatedAt: number;
};

/**
 * How long a live status can go unwritten before it's taken as gone: it's
 * written every two seconds while live, so this is a relay that's hung.
 */
const STALE_MS = 15_000;

async function relayStatus(c: Container) {
  const status = JSON.parse(
    await run(c, ['cat', '/tmp/relay/status.json'])
  ) as RelayStatus;
  const live = status.live && Date.now() - status.updatedAt < STALE_MS;
  return { ...status, live };
}

/** "8281.6kbits/s" → "8.3 Mb/s" */
function bitrate(value?: string) {
  const kbits = value ? parseFloat(value) : NaN;
  return Number.isFinite(kbits) ? `${(kbits / 1000).toFixed(1)} Mb/s` : '–';
}

/** The stream relay: whether it's on air, for how long, and how it's going. */
export const relay: App = {
  read: async ({ container: c }) => {
    const status = await relayStatus(c);
    if (!status.live) return [{ value: 'offline', tone: 'off' }];
    const seconds = status.since ? (Date.now() - status.since) / 1000 : 0;
    return [
      { value: 'live', tone: 'live' },
      // For how long, which says what it is alone, once there's a minute
      // to count
      ...(seconds >= 60 ? [{ value: formatDuration(seconds) }] : []),
      { label: 'Out', value: bitrate(status.bitrate) },
    ];
  },
  details: async ({ container: c }) => {
    const status = await relayStatus(c);
    return [
      {
        kind: 'facts',
        title: 'Stream',
        facts: status.live
          ? [
              { label: 'Live since', value: { at: status.since ?? 0 } },
              { label: 'Video in', value: status.input.video ?? '–' },
              { label: 'Audio in', value: status.input.audio ?? '–' },
              // Under 1x, it's falling behind what comes in
              { label: 'Keeping up', value: status.speed ?? '–' },
              { label: 'Sending', value: bitrate(status.bitrate) },
              {
                label: 'Dropped frames',
                value: `${status.droppedFrames ?? 0}`,
              },
            ]
          : [{ label: 'State', value: 'Offline, waiting for OBS' }],
      },
      {
        kind: 'table',
        title: 'Sends to',
        columns: [{ label: 'Where' }, { label: 'What' }],
        rows: status.outputs.map((o) => ({
          cells: [o.name, o.sends],
          dim: !status.live,
        })),
        empty: 'Nowhere',
      },
    ];
  },
};
