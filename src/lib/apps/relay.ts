import 'server-only';

import { run, type App } from '@/lib/apps/app';
import type { Container } from '@/lib/docker/docker';
import { formatDuration } from '@/lib/format';

/** How one platform is doing, each sent to by an FFmpeg of its own. */
type RelayOutput = {
  name: string;
  /** What it gets: "as it comes in", "1080p at 6000 kb/s" */
  sends: string;
  state?: 'waiting' | 'connecting' | 'live' | 'retrying';
  fps?: number;
  bitrate?: string;
  speed?: string;
  /** How many times it's been started again during this stream */
  retries?: number;
  /** Why it last failed */
  lastError?: string;
};

/** What the relay writes about its stream, in its own repository's src/status.ts. */
type RelayStatus = {
  live: boolean;
  since?: number;
  input: { video?: string; audio?: string };
  /** Since when OBS has been gone and the fallback clip has been playing in its place */
  fallbackSince?: number;
  fps?: number;
  bitrate?: string;
  speed?: string;
  droppedFrames?: number;
  outputs: RelayOutput[];
  /** What's wrong with the relay as a whole, as MediaMTX turning its password away */
  problems?: string[];
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

/** "8281.6kbits/s" > "8.3 Mb/s" */
function bitrate(value?: string) {
  const kbits = value ? parseFloat(value) : NaN;
  return Number.isFinite(kbits) ? `${(kbits / 1000).toFixed(1)} Mb/s` : '–';
}

/** What each platform is doing, as people say it */
const STATES: Record<NonNullable<RelayOutput['state']>, string> = {
  waiting: 'Waiting',
  connecting: 'Connecting',
  live: 'Sending',
  retrying: 'Retrying',
};

/** The platforms it's failing to send to while it's live, by name */
function failing(status: RelayStatus) {
  if (!status.live) return [];
  return status.outputs
    .filter((o) => o.state === 'retrying' || o.state === 'connecting')
    .map((o) => o.name);
}

/** The stream relay: whether it's on air, for how long, and how it's going. */
export const relay: App = {
  read: async ({ container: c }) => {
    const status = await relayStatus(c);
    if (!status.live) return [{ value: 'offline', tone: 'off' }];
    const seconds = status.since ? (Date.now() - status.since) / 1000 : 0;
    const down = failing(status);
    return [
      { value: 'live', tone: 'live' },
      // For how long, which says what it is alone, once there's a minute
      // to count
      ...(seconds >= 60 ? [{ value: formatDuration(seconds) }] : []),
      { label: 'Out', value: bitrate(status.bitrate) },
      // OBS dropped out, and for how long the clip has been on in its place
      ...(status.fallbackSince
        ? [
            {
              label: 'Fallback',
              value: formatDuration((Date.now() - status.fallbackSince) / 1000),
            },
          ]
        : []),
      // A platform not getting the stream, which matters more than the rest
      ...(down.length ? [{ label: 'Retrying', value: down.join(', ') }] : []),
    ];
  },
  details: async ({ container: c }) => {
    const status = await relayStatus(c);
    const problems = status.problems ?? [];
    // Why a platform last failed, as a column only when one has
    const errors = status.outputs.some((o) => o.lastError);
    return [
      {
        kind: 'facts',
        title: 'Stream',
        facts: [
          ...(status.live
            ? [
                { label: 'Live since', value: { at: status.since ?? 0 } },
                ...(status.fallbackSince
                  ? [
                      {
                        label: 'OBS dropped out',
                        value: { at: status.fallbackSince },
                      },
                    ]
                  : []),
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
            : [{ label: 'State', value: 'Offline, waiting for OBS' }]),
          ...problems.map((problem) => ({ label: 'Problem', value: problem })),
        ],
      },
      {
        kind: 'table',
        title: 'Sends to',
        columns: [
          { label: 'Where' },
          { label: 'What' },
          { label: 'State' },
          { label: 'Frame rate', numeric: true },
          { label: 'Bitrate', numeric: true },
          // Under 1x, this one's falling behind
          { label: 'Keeping up', numeric: true },
          { label: 'Restarts', numeric: true },
          ...(errors ? [{ label: 'Last error' }] : []),
        ],
        rows: status.outputs.map((o) => {
          const sending = status.live && o.state === 'live';
          return {
            cells: [
              o.name,
              o.sends,
              status.live && o.state ? STATES[o.state] : 'Waiting',
              sending && o.fps !== undefined ? `${o.fps}` : '–',
              sending ? bitrate(o.bitrate) : '–',
              sending ? (o.speed ?? '–') : '–',
              `${o.retries ?? 0}`,
              ...(errors ? [o.lastError ?? ''] : []),
            ],
            dim: !sending,
          };
        }),
        empty: 'Nowhere',
      },
    ];
  },
};
