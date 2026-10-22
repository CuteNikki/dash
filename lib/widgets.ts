import 'server-only';

import { execRun, type Container } from '@/lib/docker';
import { formatBytes, formatRate } from '@/lib/format';
import { isRunning } from '@/lib/status';
import type { Widget, WidgetStat } from '@/lib/types';

/** How long an app's numbers are kept before it's asked again. */
const FRESH_MS = 10_000;
/** How long an app has to answer. */
const TIMEOUT_MS = 4_000;

type App = {
  /** Its key, or its user and password, from dash's .env, when it needs any */
  ready?: () => boolean;
} & (
  | {
      /** Its port, to read its API at over HTTP */
      port: number;
      read: (url: string) => Promise<WidgetStat[]>;
    }
  | {
      /** Read by running commands in its container, which needs no keys */
      exec: (c: Container) => Promise<WidgetStat[]>;
    }
);

const env = (name: string) => process.env[name] || undefined;

/** What a command printed in a container, or an error if it failed or took too long. */
async function run(c: Container, cmd: string[]) {
  const { stdout, exitCode } = await Promise.race([
    execRun(c.id, cmd),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${cmd[0]} took too long`)), TIMEOUT_MS)
    ),
  ]);
  if (exitCode !== 0) throw new Error(`${cmd[0]} exited with ${exitCode}`);
  return stdout;
}

/** Garage's sizes, "216.7 kB (211.7 KiB)", in bytes: the one in powers of 1024 where there is one. */
function garageBytes(size: string) {
  const [, value, unit] =
    size.match(/\(([\d.]+) (\w+)\)/) ?? size.match(/([\d.]+) (\w+)/) ?? [];
  const power = ['B', 'KiB', 'MiB', 'GiB', 'TiB'].indexOf(unit);
  const si = ['B', 'kB', 'MB', 'GB', 'TB'].indexOf(unit);
  if (power < 0 && si < 0) throw new Error(`Unknown size: ${size}`);
  return power >= 0 ? +value * 1024 ** power : +value * 1000 ** si;
}

/** JSON from an app's API, or an error naming what failed. */
async function getJson<T>(url: string, headers: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).pathname}`);
  return res.json();
}

/**
 * Each stat on its own, so one the app's version doesn't have leaves the
 * others; only when none can be read is it an error.
 */
async function stats(
  reads: [label: string | undefined, read: () => Promise<string | number>][]
): Promise<WidgetStat[]> {
  const results = await Promise.allSettled(reads.map(([, read]) => read()));
  const read = results.flatMap((r, i): WidgetStat[] =>
    r.status === 'fulfilled'
      ? [{ label: reads[i][0], value: `${r.value}` }]
      : []
  );
  if (!read.length) {
    throw (
      results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    ).reason;
  }
  return read;
}

/** Asks once for what two stats are read from, however many ask. */
function once<T>(get: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => (promise ??= get());
}

/** Sonarr and Radarr: what's downloading, and what's wanted but missing. */
function arr(keyName: string) {
  return (url: string) => {
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
  };
}

/** qBittorrent's session, kept until it stops being accepted. */
let qbitCookie: string | undefined;

async function qbitLogin(url: string) {
  const res = await fetch(`${url}/api/v2/auth/login`, {
    method: 'POST',
    // It turns away a login whose Referer isn't its own address
    headers: { Referer: url },
    body: new URLSearchParams({
      username: env('QBITTORRENT_USERNAME')!,
      password: env('QBITTORRENT_PASSWORD')!,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Its cookie's name changes between versions, so it's taken as it comes
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  if (!res.ok || !cookie) throw new Error(`Couldn't sign in (${res.status})`);
  qbitCookie = cookie;
}

/** Signing in, shared by the stats that need it at once, so it signs in once. */
let qbitSigningIn: Promise<void> | undefined;

function qbitSignIn(url: string) {
  return (qbitSigningIn ??= qbitLogin(url).finally(() => {
    qbitSigningIn = undefined;
  }));
}

async function qbitJson<T>(url: string, path: string): Promise<T> {
  if (!qbitCookie) await qbitSignIn(url);
  const used = qbitCookie;
  try {
    return await getJson<T>(`${url}${path}`, { Cookie: used! });
  } catch {
    // Its session may have run out: once more, signed in again, unless
    // another stat already has
    if (qbitCookie === used) await qbitSignIn(url);
    return getJson<T>(`${url}${path}`, { Cookie: qbitCookie! });
  }
}

const APPS: Record<string, App> = {
  sonarr: {
    port: 8989,
    ready: () => !!env('SONARR_API_KEY'),
    read: arr('SONARR_API_KEY'),
  },
  radarr: {
    port: 7878,
    ready: () => !!env('RADARR_API_KEY'),
    read: arr('RADARR_API_KEY'),
  },
  prowlarr: {
    port: 9696,
    ready: () => !!env('PROWLARR_API_KEY'),
    read: (url) => {
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
  },
  jellyfin: {
    port: 8096,
    ready: () => !!env('JELLYFIN_API_KEY'),
    read: (url) => {
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
  },
  qbittorrent: {
    port: 8080,
    ready: () => !!env('QBITTORRENT_USERNAME') && !!env('QBITTORRENT_PASSWORD'),
    read: async (url) => {
      const transfer = once(() =>
        qbitJson<{ dl_info_speed: number; up_info_speed: number }>(
          url,
          '/api/v2/transfer/info'
        )
      );
      return stats([
        ['Down', async () => formatRate((await transfer()).dl_info_speed)],
        ['Up', async () => formatRate((await transfer()).up_info_speed)],
        [
          'Downloading',
          async () =>
            (
              await qbitJson<unknown[]>(
                url,
                '/api/v2/torrents/info?filter=downloading'
              )
            ).length,
        ],
      ]);
    },
  },
  // itzg/minecraft-server, which comes with mc-monitor and rcon-cli
  'minecraft-server': {
    exec: (c) => {
      const status = once(
        async () =>
          JSON.parse(await run(c, ['mc-monitor', 'status', '--json'])) as {
            server_info: {
              version: { name: string };
              players: { online: number; max: number };
            };
          }
      );
      return stats([
        [
          'Players',
          async () => {
            const { players } = (await status()).server_info;
            return `${players.online} / ${players.max}`;
          },
        ],
        [
          'TPS',
          async () => {
            // "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0", in color, and
            // with a * when it's caught up past 20
            const out = (await run(c, ['rcon-cli', 'tps'])).replace(
              /\x1b\[[\d;]*m/g,
              ''
            );
            const tps = out.match(/:\s*\*?([\d.]+)/)?.[1];
            if (!tps) throw new Error(`Unexpected: ${out}`);
            return tps;
          },
        ],
        // "Paper 26.2" says what it is without a label
        [undefined, async () => (await status()).server_info.version.name],
      ]);
    },
  },
  postgres: {
    exec: (c) =>
      stats([
        [
          'Connections',
          async () =>
            (
              await run(c, [
                'psql',
                '-U',
                'postgres',
                '-tAc',
                "select count(*) from pg_stat_activity where backend_type = 'client backend'",
              ])
            ).trim(),
        ],
      ]),
  },
  // Garage, the image storage: what all its buckets hold together
  garage: {
    exec: async (c) => {
      const ids = (await run(c, ['/garage', 'bucket', 'list']))
        .split('\n')
        .map((line) => line.match(/^([0-9a-f]{16})\s/)?.[1])
        .filter((id) => id !== undefined);
      const infos = once(() =>
        Promise.all(ids.map((id) => run(c, ['/garage', 'bucket', 'info', id])))
      );
      const total = async (field: string, parse: (s: string) => number) =>
        (await infos()).reduce((sum, info) => {
          const value = info.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1];
          if (!value) throw new Error(`No ${field} in its bucket info`);
          return sum + parse(value);
        }, 0);
      return stats([
        ['Objects', () => total('Objects', Number)],
        ['Used', async () => formatBytes(await total('Size', garageBytes))],
      ]);
    },
  },
  // Its admin API is off, so its sites are counted from its Caddyfile
  caddy: {
    exec: (c) =>
      stats([
        [
          'Sites',
          async () => {
            const config = JSON.parse(
              await run(c, [
                'caddy',
                'adapt',
                '--config',
                '/etc/caddy/Caddyfile',
              ])
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
  },
};

/** "lscr.io/linuxserver/sonarr:latest" → "sonarr" */
function appOf(c: Container) {
  const name = c.image.split('/').pop()?.split(/[:@]/)[0];
  return name && name in APPS ? name : undefined;
}

/**
 * Where to reach an app: SONARR_URL and so on, or its container by name on a
 * network dash shares with it. qBittorrent behind a VPN container needs its
 * URL set, to the VPN container's name.
 */
function urlOf(app: string, c: Container, port: number) {
  return (
    env(`${app.toUpperCase()}_URL`)?.replace(/\/$/, '') ??
    `http://${c.name}:${port}`
  );
}

/** Its numbers, over HTTP or by running commands in its container. */
function readApp(app: string, c: Container) {
  const a = APPS[app];
  return 'exec' in a ? a.exec(c) : a.read(urlOf(app, c, a.port));
}

type Cached = { at: number; widget?: Widget; pending?: Promise<void> };

// By container, so two of the same app have their own. Kept on globalThis
// so development's hot reloads keep them
const cache: Map<string, Cached> = ((
  globalThis as typeof globalThis & { widgetCache?: Map<string, Cached> }
).widgetCache ??= new Map());

function refresh(app: string, c: Container) {
  const entry = cache.get(c.id);
  if (entry?.pending) return entry.pending;
  const pending = readApp(app, c)
    .then(
      (stats): Widget => ({ stats }),
      (e: unknown): Widget => ({
        error: e instanceof Error ? e.message : String(e),
      })
    )
    .then((widget) => {
      cache.set(c.id, { at: Date.now(), widget });
    });
  cache.set(c.id, { at: entry?.at ?? 0, widget: entry?.widget, pending });
  return pending;
}

/**
 * Live numbers for each running container whose app has a widget and its
 * keys set, by container id. Numbers already read come back at once, even a
 * little old, while newer ones are fetched; only the first wait for the app.
 */
export async function readWidgets(
  containers: Container[]
): Promise<Map<string, Widget>> {
  const found = containers.flatMap((c) => {
    const app = appOf(c);
    return app && isRunning(c.state) && (APPS[app].ready?.() ?? true)
      ? [{ c, app }]
      : [];
  });
  await Promise.all(
    found.map(({ c, app }) => {
      const entry = cache.get(c.id);
      if (entry && Date.now() - entry.at < FRESH_MS) return;
      const pending = refresh(app, c);
      // Only the first reading is waited for
      return entry?.widget ? undefined : pending;
    })
  );
  return new Map(
    found.flatMap(({ c }) => {
      const widget = cache.get(c.id)?.widget;
      return widget ? [[c.id, widget]] : [];
    })
  );
}
