import 'server-only';

import { env, getJson, run, type App, type RemoteApp } from '@/lib/apps/app';
import type { Container } from '@/lib/docker/docker';
import type {
  DetailCell,
  DetailKey,
  DetailSection,
  WidgetStat,
} from '@/lib/types';

/** How one platform is doing, each sent to by an FFmpeg of its own. */
type RelayOutput = {
  name: string;
  /** What it gets: "as it comes in", "1080p at 6000 kb/s" */
  sends: string;
  /** Which of OBS's streams it gets */
  input?: 'landscape' | 'vertical';
  state?: 'waiting' | 'connecting' | 'live' | 'retrying';
  fps?: number;
  bitrate?: string;
  speed?: string;
  /** How many times it's been started again during this stream */
  retries?: number;
  /** Why it last failed */
  lastError?: string;
};

/** One of the streams OBS sends: its usual landscape one, or a second, vertical one */
type RelayInput = {
  name: 'landscape' | 'vertical';
  live: boolean;
  since?: number;
  media: { video?: string; audio?: string };
  /** Since when OBS has been gone and the fallback clip has been playing in its place */
  fallbackSince?: number;
};

/** What the relay writes about its stream, in its own repository's src/status.ts. */
type RelayStatus = {
  live: boolean;
  since?: number;
  input: { video?: string; audio?: string };
  /** Since when OBS has been gone and the fallback clip has been playing in its place */
  fallbackSince?: number;
  /** Each of OBS's streams some platform gets, landscape first */
  inputs?: RelayInput[];
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

/** Not live once it's gone unwritten for too long, whatever it last said. */
function current(status: RelayStatus): RelayStatus {
  const live = status.live && Date.now() - status.updatedAt < STALE_MS;
  return { ...status, live };
}

/** Its status, from the file it writes in its container here. */
async function relayStatus(c: Container) {
  return current(
    JSON.parse(await run(c, ['cat', '/tmp/relay/status.json'])) as RelayStatus
  );
}

/**
 * Where a relay on another machine serves its status, with the token to
 * read it, from RELAY_STATUS_URL and RELAY_STATUS_TOKEN; unset, there's none.
 */
function statusUrl() {
  const url = env('RELAY_STATUS_URL');
  if (!url || !env('RELAY_STATUS_TOKEN')) return undefined;
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Its status, from a relay on another machine, over HTTP. */
async function remoteStatus() {
  const url = statusUrl();
  if (!url) throw new Error('RELAY_STATUS_URL is not set');
  return current(
    await getJson<RelayStatus>(url.href, {
      Authorization: `Bearer ${env('RELAY_STATUS_TOKEN')}`,
    })
  );
}

/** "8281.6kbits/s" > "8.3 Mb/s" */
function bitrate(value?: string): DetailCell {
  const kbits = value ? parseFloat(value) : NaN;
  return Number.isFinite(kbits)
    ? { fixed: kbits / 1000, digits: 1, unit: 'Mb/s' }
    : '–';
}

/** Each of OBS's streams: what it's called, what comes in on it, and when it dropped out. */
const INPUTS = {
  landscape: {
    name: 'landscape',
    in: 'landscapeIn',
    dropped: 'landscapeDroppedOut',
  },
  vertical: {
    name: 'vertical',
    in: 'verticalIn',
    dropped: 'verticalDroppedOut',
  },
} as const satisfies Record<RelayInput['name'], Record<string, DetailKey>>;

/**
 * When OBS dropped out of whichever stream it did first, while the fallback
 * clip plays in its place
 */
function droppedSince(status: RelayStatus) {
  const since = (status.inputs ?? [])
    .map((i) => i.fallbackSince)
    .filter((at): at is number => at !== undefined);
  return since.length ? Math.min(...since) : status.fallbackSince;
}

/** What each platform is doing, as people say it */
const STATES = {
  waiting: 'relayWaiting',
  connecting: 'relayConnecting',
  live: 'relaySending',
  retrying: 'relayRetrying',
} as const satisfies Record<NonNullable<RelayOutput['state']>, DetailKey>;

/** The platforms it's failing to send to while it's live, by name */
function failing(status: RelayStatus) {
  if (!status.live) return [];
  return status.outputs
    .filter((o) => o.state === 'retrying' || o.state === 'connecting')
    .map((o) => o.name);
}

/** Its bitrate on a chip, which takes no words: "8.3 Mb/s", or "–" while it hasn't one. */
function outRate(value?: string): WidgetStat['value'] {
  const rate = bitrate(value);
  return typeof rate === 'string' || !('fixed' in rate) ? '–' : rate;
}

/** Whether it's on air, for how long, and how it's going: its tile's numbers. */
function statsOf(status: RelayStatus): WidgetStat[] {
  if (!status.live) {
    return [
      { label: 'onAir', bare: true, value: { says: 'offline' }, tone: 'off' },
    ];
  }
  const seconds = status.since ? (Date.now() - status.since) / 1000 : 0;
  const down = failing(status);
  const dropped = droppedSince(status);
  return [
    { label: 'onAir', bare: true, value: { says: 'live' }, tone: 'live' },
    // For how long, which says what it is alone, once there's a minute
    // to count
    ...(seconds >= 60
      ? [{ label: 'onAirFor' as const, bare: true, value: { seconds } }]
      : []),
    { label: 'out', value: outRate(status.bitrate) },
    // OBS dropped out, and for how long the clip has been on in its place
    ...(dropped
      ? [
          {
            label: 'fallback' as const,
            value: { seconds: (Date.now() - dropped) / 1000 },
          },
        ]
      : []),
    // A platform not getting the stream, which matters more than the rest
    ...(down.length
      ? [{ label: 'retrying' as const, value: down.join(', ') }]
      : []),
  ];
}

/** One line of its stream's facts. */
type Fact = { label: DetailKey; value: DetailCell };

/** Its stream, and each platform it sends to: its window's sections. */
function detailsOf(status: RelayStatus): DetailSection[] {
  const problems = status.problems ?? [];
  // Why a platform last failed, as a column only when one has
  const errors = status.outputs.some((o) => o.lastError);
  // Each of OBS's streams on its own, once there's more than one
  const inputs = status.live ? (status.inputs ?? []) : [];
  const both = (status.inputs ?? []).length > 1;
  const facts: Fact[] = [];
  if (!status.live) {
    facts.push({ label: 'state', value: { text: 'offlineWaiting' } });
  } else {
    facts.push({ label: 'liveSince', value: { at: status.since ?? 0 } });
    if (both) {
      for (const i of inputs) {
        facts.push({
          label: INPUTS[i.name].in,
          value: i.live ? (i.media.video ?? '–') : { text: 'notStreaming' },
        });
        if (i.fallbackSince) {
          facts.push({
            label: INPUTS[i.name].dropped,
            value: { at: i.fallbackSince },
          });
        }
      }
    } else {
      if (status.fallbackSince) {
        facts.push({
          label: 'obsDroppedOut',
          value: { at: status.fallbackSince },
        });
      }
      facts.push(
        { label: 'videoIn', value: status.input.video ?? '–' },
        { label: 'audioIn', value: status.input.audio ?? '–' }
      );
    }
    facts.push(
      // Under 1x, it's falling behind what comes in
      { label: 'keepingUp', value: status.speed ?? '–' },
      { label: 'sending', value: bitrate(status.bitrate) },
      { label: 'droppedFrames', value: { number: status.droppedFrames ?? 0 } }
    );
  }
  // In the relay's own words
  for (const problem of problems)
    facts.push({ label: 'problem', value: problem });
  return [
    {
      kind: 'facts',
      title: 'stream',
      facts,
    },
    {
      kind: 'table',
      title: 'sendsTo',
      columns: [
        { label: 'where' },
        { label: 'what' },
        ...(both ? [{ label: 'input' as const }] : []),
        { label: 'state' },
        { label: 'frameRate', numeric: true },
        { label: 'bitrate', numeric: true },
        // Under 1x, this one's falling behind
        { label: 'keepingUp', numeric: true },
        { label: 'restarts', numeric: true },
        ...(errors ? [{ label: 'lastError' as const }] : []),
      ],
      rows: status.outputs.map((o) => {
        const sending = status.live && o.state === 'live';
        return {
          cells: [
            o.name,
            // In the relay's own words: "as it comes in", "1080p at 6000 kb/s"
            o.sends,
            ...(both ? [{ text: INPUTS[o.input ?? 'landscape'].name }] : []),
            {
              text: status.live && o.state ? STATES[o.state] : STATES.waiting,
            },
            sending && o.fps !== undefined ? { number: o.fps } : '–',
            sending ? bitrate(o.bitrate) : '–',
            sending ? (o.speed ?? '–') : '–',
            { number: o.retries ?? 0 },
            ...(errors ? [o.lastError ?? ''] : []),
          ],
          dim: !sending,
        };
      }),
      empty: 'nowhere',
    },
  ];
}

/** The stream relay, in a container here. */
export const relay: App = {
  read: async ({ container: c }) => statsOf(await relayStatus(c)),
  details: async ({ container: c }) => detailsOf(await relayStatus(c)),
};

/**
 * The stream relay on another machine, read over HTTP: on the website tile
 * whose address is on the same host as RELAY_STATUS_URL.
 */
export const remoteRelay: RemoteApp = {
  url: statusUrl,
  read: async () => statsOf(await remoteStatus()),
  details: async () => detailsOf(await remoteStatus()),
};
