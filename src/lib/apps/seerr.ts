import 'server-only';

import { env, getJson, once, stats, type App } from '@/lib/apps/app';

/**
 * Jellyseerr, where requests for films and shows are made: what's waiting
 * for approval and what's been approved, once its key is in .env, and
 * whether there's an update, which needs none.
 */
export const seerr: App = {
  port: 5055,
  read: ({ url }) => {
    const key = env('SEERR_API_KEY');
    const counts = once(() =>
      getJson<{ pending: number; approved: number }>(
        `${url}/api/v1/request/count`,
        { 'X-Api-Key': key! }
      )
    );
    const reads: Parameters<typeof stats>[0] = [
      [
        undefined,
        async () => {
          const status = await getJson<{ updateAvailable: boolean }>(
            `${url}/api/v1/status`,
            {}
          );
          if (!status.updateAvailable) throw new Error('Up to date');
          return 'update available';
        },
      ],
    ];
    if (key) {
      reads.unshift(
        ['Pending', async () => (await counts()).pending],
        ['Approved', async () => (await counts()).approved]
      );
    }
    return stats(reads);
  },
};
