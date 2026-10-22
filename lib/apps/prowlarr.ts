import 'server-only';

import { env, getJson, stats, type App } from '@/lib/apps/app';

export const prowlarr: App = {
  port: 9696,
  ready: () => !!env('PROWLARR_API_KEY'),
  read: ({ url }) => {
    const headers = { 'X-Api-Key': env('PROWLARR_API_KEY')! };
    const indexerStats = () =>
      getJson<{ indexers: { numberOfGrabs: number }[] }>(
        `${url}/api/v1/indexerstats`,
        headers
      );
    return stats([
      [
        'Indexers',
        async () =>
          (
            await getJson<{ enable: boolean }[]>(
              `${url}/api/v1/indexer`,
              headers
            )
          ).filter((i) => i.enable).length,
      ],
      [
        'Grabs',
        async () =>
          (await indexerStats()).indexers.reduce(
            (sum, i) => sum + i.numberOfGrabs,
            0
          ),
      ],
    ]);
  },
};
