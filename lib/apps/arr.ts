import 'server-only';

import { env, getJson, stats, type App } from '@/lib/apps/app';

/** Sonarr and Radarr: what's downloading, and what's wanted but missing. */
function arr(port: number, keyName: string): App {
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
  };
}

export const sonarr = arr(8989, 'SONARR_API_KEY');
export const radarr = arr(7878, 'RADARR_API_KEY');
