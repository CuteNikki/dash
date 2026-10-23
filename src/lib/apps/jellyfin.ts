import 'server-only';

import { env, getJson, once, stats, type App } from '@/lib/apps/app';
import { episodeName } from '@/lib/apps/arr';

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
const PLAY_METHODS: Record<string, string> = {
  DirectPlay: 'direct play',
  DirectStream: 'direct stream',
  Transcode: 'transcoding',
};

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
        'Streaming',
        async () =>
          (
            await getJson<Session[]>(
              `${url}/Sessions?activeWithinSeconds=600`,
              headers
            )
          ).filter((s) => s.NowPlayingItem).length,
      ],
      ['Movies', async () => (await counts()).MovieCount],
      ['Shows', async () => (await counts()).SeriesCount],
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
        title: 'Now playing',
        columns: [
          { label: 'What' },
          { label: 'Who' },
          { label: 'Progress', numeric: true },
          { label: 'How' },
        ],
        rows: sessions.flatMap((s) => {
          const item = s.NowPlayingItem;
          if (!item) return [];
          const position = s.PlayState?.PositionTicks ?? 0;
          const method =
            PLAY_METHODS[s.PlayState?.PlayMethod ?? ''] ??
            s.PlayState?.PlayMethod ??
            '–';
          return [
            {
              cells: [
                itemName(item),
                [s.UserName, s.DeviceName].filter(Boolean).join(' on '),
                {
                  progress: item.RunTimeTicks
                    ? position / item.RunTimeTicks
                    : 0,
                },
                s.PlayState?.IsPaused ? `${method}, paused` : method,
              ],
              dim: s.PlayState?.IsPaused,
            },
          ];
        }),
        empty: 'No one’s watching',
      },
      {
        kind: 'table',
        title: 'Recently added',
        columns: [{ label: 'Title' }, { label: 'Added', numeric: true }],
        rows: latest.Items.map((item) => ({
          cells: [
            itemName(item),
            item.DateCreated ? { at: Date.parse(item.DateCreated) } : '–',
          ],
        })),
        empty: 'Nothing yet',
      },
    ];
  },
};
