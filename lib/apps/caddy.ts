import 'server-only';

import { run, stats, type App } from '@/lib/apps/app';

/** Its admin API is off, so its sites are counted from its Caddyfile. */
export const caddy: App = {
  read: ({ container: c }) =>
    stats([
      [
        'Sites',
        async () => {
          const config = JSON.parse(
            await run(c, ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile'])
          ) as {
            apps?: {
              http?: {
                servers?: Record<
                  string,
                  { routes?: { match?: { host?: string[] }[] }[] }
                >;
              };
            };
          };
          return Object.values(config.apps?.http?.servers ?? {})
            .flatMap((s) => s.routes ?? [])
            .filter((r) => r.match?.some((m) => m.host?.length)).length;
        },
      ],
    ]),
};
