import 'server-only';

import { run, type App } from '@/lib/apps/app';
import type { Container } from '@/lib/docker/docker';

type Route = { match?: { host?: string[] }[]; handle?: unknown[] };

/** Its routes for addresses, from its Caddyfile, since its admin API is off. */
async function sites(c: Container) {
  const config = JSON.parse(
    await run(c, ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile'])
  ) as { apps?: { http?: { servers?: Record<string, { routes?: Route[] }> } } };
  return Object.values(config.apps?.http?.servers ?? {})
    .flatMap((s) => s.routes ?? [])
    .filter((r) => r.match?.some((m) => m.host?.length));
}

/**
 * Where a route sends what it gets: the addresses it proxies to, however
 * deep in its subroutes, or that it serves files or redirects.
 */
function targets(route: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.handler === 'reverse_proxy') {
      for (const u of (node.upstreams as { dial?: string }[]) ?? []) {
        if (u.dial) found.add(u.dial);
      }
    } else if (node.handler === 'file_server') {
      found.add('files');
    } else if (node.handler === 'static_response') {
      const location = (node.headers as { Location?: string[] })?.Location;
      found.add(
        location?.length
          ? `redirect to ${location[0]}`
          : 'a response of its own'
      );
    }
    Object.values(node).forEach(visit);
  };
  visit(route);
  return [...found];
}

export const caddy: App = {
  read: async ({ container: c }) => [
    { label: 'Sites', value: `${(await sites(c)).length}` },
  ],
  details: async ({ container: c }) => [
    {
      kind: 'table',
      title: 'Sites',
      columns: [{ label: 'Address' }, { label: 'Goes to' }],
      rows: (await sites(c)).map((route) => {
        const hosts = route.match!.flatMap((m) => m.host ?? []);
        return {
          cells: [
            // The rest of a route's addresses, such as autoconfig.… for
            // mail, are counted rather than listed
            hosts.length > 1
              ? `${hosts[0]} +${hosts.length - 1} more`
              : hosts[0],
            targets(route).join(', ') || '–',
          ],
        };
      }),
      empty: 'No sites',
    },
  ],
};
