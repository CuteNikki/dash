import 'server-only';

import { env, getJson, once, stats, type App } from '@/lib/apps/app';
import { episodeName } from '@/lib/apps/arr';
import type { DetailCell, DetailKey } from '@/lib/types';

type Item = {
  Name: string;
  Type: string;
  SeriesName?: string;
  /** Its season, for an episode */
  ParentIndexNumber?: number;
  /** Its number in its season, for an episode */
  IndexNumber?: number;
  /** In ticks of 100 ns */
  RunTimeTicks?: number;
  DateCreated?: string;
};

type Session = {
  UserName?: string;
  DeviceName?: string;
  NowPlayingItem?: Item;
  PlayState?: {
    PositionTicks?: number;
    IsPaused?: boolean;
    PlayMethod?: string;
  };
};

/** An episode with its show and number, anything else by its name. */
function itemName(item: Item) {
  return item.Type === 'Episode' && item.SeriesName
    ? episodeName(item.SeriesName, item.ParentIndexNumber, item.IndexNumber)
    : item.Name;
}

/** How it's being played: as it is, or turned into something the device can. */
const PLAY_METHODS = {
  DirectPlay: 'directPlay',
  DirectStream: 'directStream',
  Transcode: 'transcoding',
} as const satisfies Record<string, DetailKey>;

function headersOf() {
  return { Authorization: `MediaBrowser Token="${env('JELLYFIN_API_KEY')}"` };
}

export const jellyfin: App = {
  port: 8096,
  ready: () => !!env('JELLYFIN_API_KEY'),
  read: ({ url }) => {
    const headers = headersOf();
    const counts = once(() =>
      getJson<{ MovieCount: number; SeriesCount: number }>(
        `${url}/Items/Counts`,
        headers
      )
    );
    return stats([
      [
        'streaming',
        async () =>
          (
            await getJson<Session[]>(
              `${url}/Sessions?activeWithinSeconds=600`,
              headers
            )
          ).filter((s) => s.NowPlayingItem).length,
      ],
      ['movies', async () => (await counts()).MovieCount],
      ['shows', async () => (await counts()).SeriesCount],
    ]);
  },
  details: async ({ url }) => {
    const headers = headersOf();
    const [sessions, latest] = await Promise.all([
      getJson<Session[]>(`${url}/Sessions?activeWithinSeconds=600`, headers),
      getJson<{ Items: Item[] }>(
        `${url}/Items?SortBy=DateCreated&SortOrder=Descending&Limit=8&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=DateCreated`,
        headers
      ),
    ]);
    return [
      {
        kind: 'table',
        title: 'nowPlaying',
        columns: [
          { label: 'what' },
          { label: 'who' },
          { label: 'progress', numeric: true },
          { label: 'how' },
        ],
        rows: sessions.flatMap((s) => {
          const item = s.NowPlayingItem;
          if (!item) return [];
          const position = s.PlayState?.PositionTicks ?? 0;
          const name = s.PlayState?.PlayMethod;
          // One it doesn't know, in Jellyfin's own word
          const key =
            name && Object.hasOwn(PLAY_METHODS, name)
              ? PLAY_METHODS[name as keyof typeof PLAY_METHODS]
              : undefined;
          const paused = !!s.PlayState?.IsPaused;
          const method: DetailCell = key
            ? { text: paused ? `${key}Paused` : key }
            : (name ?? '–');
          return [
            {
              cells: [
                itemName(item),
                s.UserName && s.DeviceName
                  ? {
                      text: 'userOnDevice',
                      values: { user: s.UserName, device: s.DeviceName },
                    }
                  : (s.UserName ?? s.DeviceName ?? '–'),
                {
                  progress: item.RunTimeTicks
                    ? position / item.RunTimeTicks
                    : 0,
                },
                method,
              ],
              dim: paused,
            },
          ];
        }),
        empty: 'noOneWatching',
      },
      {
        kind: 'table',
        title: 'recentlyAdded',
        columns: [{ label: 'title' }, { label: 'added', numeric: true }],
        rows: latest.Items.map((item) => ({
          cells: [
            itemName(item),
            item.DateCreated ? { at: Date.parse(item.DateCreated) } : '–',
          ],
        })),
        empty: 'nothingYet',
      },
    ];
  },
};
