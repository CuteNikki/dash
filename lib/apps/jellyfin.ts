import 'server-only';

import { env, getJson, once, stats, type App } from '@/lib/apps/app';

export const jellyfin: App = {
  port: 8096,
  ready: () => !!env('JELLYFIN_API_KEY'),
  read: ({ url }) => {
    const headers = {
      Authorization: `MediaBrowser Token="${env('JELLYFIN_API_KEY')}"`,
    };
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
            await getJson<{ NowPlayingItem?: unknown }[]>(
              `${url}/Sessions?activeWithinSeconds=600`,
              headers
            )
          ).filter((s) => s.NowPlayingItem).length,
      ],
      ['Movies', async () => (await counts()).MovieCount],
      ['Shows', async () => (await counts()).SeriesCount],
    ]);
  },
};
