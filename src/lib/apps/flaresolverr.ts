import 'server-only';

import { getJson, type App } from '@/lib/apps/app';

/** Solves Cloudflare's checks for Prowlarr: whether it's ready, and its version. */
export const flaresolverr: App = {
  port: 8191,
  read: async ({ url }) => {
    const { version } = await getJson<{ msg: string; version: string }>(
      `${url}/`,
      {}
    );
    return [{ value: `v${version}` }];
  },
};
