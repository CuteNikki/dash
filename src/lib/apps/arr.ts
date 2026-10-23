import 'server-only';

import { env, getJson, stats, type App } from '@/lib/apps/app';
import { formatDuration } from '@/lib/format';
import type { DetailCell, DetailSection } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Severance S02E05" */
export function episodeName(show: string, season?: number, episode?: number) {
  const pad = (n?: number) => `${n ?? 0}`.padStart(2, '0');
  return season === undefined && episode === undefined
    ? show
    : `${show} S${pad(season)}E${pad(episode)}`;
}

/** Sonarr's and Radarr's "time left", "01:02:03" or "1.02:03:04", in seconds. */
function seconds(timeleft: string) {
  const [days, rest] = timeleft.includes('.')
    ? timeleft.split('.')
    : ['0', timeleft];
  const [h, m, s] = rest.split(':').map(Number);
  return +days * 86400 + h * 3600 + m * 60 + s;
}

type QueueItem = {
  size: number;
  sizeleft: number;
  /** Missing while it's waiting, or once it's done */
  timeleft?: string;
  /** "downloading", "queued", "paused", "completed"… */
  status: string;
  /** "importPending", "importing"…, once it's downloaded */
  trackedDownloadState?: string;
  title: string;
  series?: { title: string };
  episode?: { seasonNumber: number; episodeNumber: number };
  movie?: { title: string; year?: number };
};

/** A queue as a table: each one, how far along, and how long it has left or what it's waiting on. */
function queueTable(title: string, items: QueueItem[]): DetailSection {
  return {
    kind: 'table',
    title,
    columns: [
      { label: 'Name' },
      { label: 'Progress', numeric: true },
      { label: 'Left', numeric: true },
    ],
    rows: items.map((item) => {
      const name = item.series
        ? episodeName(
            item.series.title,
            item.episode?.seasonNumber,
            item.episode?.episodeNumber
          )
        : item.movie
          ? `${item.movie.title}${item.movie.year ? ` (${item.movie.year})` : ''}`
          : item.title;
      const progress: DetailCell = {
        progress: item.size ? 1 - item.sizeleft / item.size : 0,
      };
      // Downloading, how long; otherwise what it's doing, as "import pending"
      const state = (item.trackedDownloadState ?? item.status)
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase();
      const left =
        item.status === 'downloading' && item.timeleft
          ? formatDuration(seconds(item.timeleft))
          : state;
      return {
        cells: [name, progress, left],
        dim: item.status !== 'downloading',
      };
    }),
    empty: 'Nothing’s downloading',
  };
}

/** Sonarr and Radarr: what's downloading, and what's wanted but missing. */
function arr(
  port: number,
  keyName: string,
  upcoming: (url: string, headers: HeadersInit) => Promise<DetailSection>,
  include: string
): App {
  return {
    port,
    ready: () => !!env(keyName),
    read: ({ url }) => {
      const headers = { 'X-Api-Key': env(keyName)! };
      return stats([
        [
          'Queued',
          async () =>
            (
              await getJson<{ totalCount: number }>(
                `${url}/api/v3/queue/status`,
                headers
              )
            ).totalCount,
        ],
        [
          'Missing',
          async () =>
            (
              await getJson<{ totalRecords: number }>(
                `${url}/api/v3/wanted/missing?pageSize=1`,
                headers
              )
            ).totalRecords,
        ],
      ]);
    },
    details: async ({ url }) => {
      const headers = { 'X-Api-Key': env(keyName)! };
      const [queue, coming] = await Promise.all([
        getJson<{ records: QueueItem[] }>(
          `${url}/api/v3/queue?pageSize=50&${include}`,
          headers
        ),
        upcoming(url, headers),
      ]);
      return [queueTable('Downloading', queue.records), coming];
    },
  };
}

/** Its range for the calendar, from now. */
function range(days: number) {
  const start = new Date();
  const end = new Date(start.getTime() + days * DAY_MS);
  return `start=${start.toISOString()}&end=${end.toISOString()}`;
}

export const sonarr = arr(
  8989,
  'SONARR_API_KEY',
  async (url, headers) => {
    const episodes = await getJson<
      {
        seasonNumber: number;
        episodeNumber: number;
        airDateUtc?: string;
        hasFile: boolean;
        series: { title: string };
      }[]
    >(`${url}/api/v3/calendar?${range(7)}&includeSeries=true`, headers);
    return {
      kind: 'table',
      title: 'Airing this week',
      columns: [{ label: 'Episode' }, { label: 'Airs', numeric: true }],
      rows: episodes
        .filter((e) => e.airDateUtc)
        .map((e) => ({
          cells: [
            episodeName(e.series.title, e.seasonNumber, e.episodeNumber),
            { at: Date.parse(e.airDateUtc!) },
          ],
          // Already here
          dim: e.hasFile,
        })),
      empty: 'Nothing airs this week',
    };
  },
  'includeSeries=true&includeEpisode=true'
);

export const radarr = arr(
  7878,
  'RADARR_API_KEY',
  async (url, headers) => {
    const movies = await getJson<
      {
        title: string;
        year?: number;
        hasFile: boolean;
        inCinemas?: string;
        digitalRelease?: string;
        physicalRelease?: string;
      }[]
    >(`${url}/api/v3/calendar?${range(30)}`, headers);
    const now = Date.now();
    return {
      kind: 'table',
      title: 'Coming out this month',
      columns: [
        { label: 'Film' },
        { label: 'Release' },
        { label: 'When', numeric: true },
      ],
      rows: movies
        .flatMap((m) => {
          // Its next release still to come, of the three it can have
          const next = (
            [
              ['in cinemas', m.inCinemas],
              ['digital', m.digitalRelease],
              ['on disc', m.physicalRelease],
            ] as const
          )
            .filter(([, at]) => at && Date.parse(at) >= now - DAY_MS)
            .sort(([, a], [, b]) => Date.parse(a!) - Date.parse(b!))[0];
          return next ? [{ m, kind: next[0], at: Date.parse(next[1]!) }] : [];
        })
        .sort((a, b) => a.at - b.at)
        .map(({ m, kind, at }) => ({
          cells: [m.year ? `${m.title} (${m.year})` : m.title, kind, { at }],
          dim: m.hasFile,
        })),
      empty: 'Nothing comes out this month',
    };
  },
  'includeMovie=true'
);
