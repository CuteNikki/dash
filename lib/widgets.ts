import 'server-only';

import type { Container } from '@/lib/docker';
import { formatRate } from '@/lib/format';
import { isRunning } from '@/lib/status';
import type { Widget, WidgetStat } from '@/lib/types';

/** How long an app's numbers are kept before it's asked again. */
const FRESH_MS = 10_000;
/** How long an app has to answer. */
const TIMEOUT_MS = 4_000;

type App = {
  port: number;
  /** Its key, or its user and password, from dash's .env */
  ready: () => boolean;
  read: (url: string) => Promise<WidgetStat[]>;
};

const env = (name: string) => process.env[name] || undefined;

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
  reads: [label: string, read: () => Promise<string | number>][]
): Promise<WidgetStat[]> {
  const results = await Promise.allSettled(reads.map(([, read]) => read()));
  const read = results.flatMap((r, i) =>
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

/** Sonarr and Radarr:what's downloading, and what's wanted but missing. */
function arr(keyName: string): App['read'] {
  return (url) => {
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
function urlOf(app: string, c: Container) {
  return (
    env(`${app.toUpperCase()}_URL`)?.replace(/\/$/, '') ??
    `http://${c.name}:${APPS[app].port}`
  );
}

type Cached = { at: number; widget?: Widget; pending?: Promise<void> };

// Kept on globalThis so development's hot reloads keep them
const cache: Map<string, Cached> = ((
  globalThis as typeof globalThis & { widgetCache?: Map<string, Cached> }
).widgetCache ??= new Map());

function refresh(app: string, url: string) {
  const entry = cache.get(app);
  if (entry?.pending) return entry.pending;
  const pending = APPS[app]
    .read(url)
    .then(
      (stats): Widget => ({ stats }),
      (e: unknown): Widget => ({
        error: e instanceof Error ? e.message : String(e),
      })
    )
    .then((widget) => {
      cache.set(app, { at: Date.now(), widget });
    });
  cache.set(app, { at: entry?.at ?? 0, widget: entry?.widget, pending });
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
    return app && isRunning(c.state) && APPS[app].ready() ? [{ c, app }] : [];
  });
  await Promise.all(
    found.map(({ c, app }) => {
      const entry = cache.get(app);
      if (entry && Date.now() - entry.at < FRESH_MS) return;
      const pending = refresh(app, urlOf(app, c));
      // Only the first reading is waited for
      return entry?.widget ? undefined : pending;
    })
  );
  return new Map(
    found.flatMap(({ c, app }) => {
      const widget = cache.get(app)?.widget;
      return widget ? [[c.id, widget]] : [];
    })
  );
}
