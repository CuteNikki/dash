import 'server-only';

import {
  env,
  getJson,
  once,
  stats,
  TIMEOUT_MS,
  type App,
} from '@/lib/apps/app';
import { formatDuration, formatRate } from '@/lib/format';

/**
 * qBittorrent's sessions, each kept until it stops being accepted. By its
 * address, as two of them would otherwise keep signing each other out.
 */
const qbitCookies = new Map<string, string>();

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
  qbitCookies.set(url, cookie);
}

/** Signing in, shared by the stats that need it at once, so each signs in once. */
const qbitSigningIn = new Map<string, Promise<void>>();

function qbitSignIn(url: string) {
  let signingIn = qbitSigningIn.get(url);
  if (!signingIn) {
    signingIn = qbitLogin(url).finally(() => qbitSigningIn.delete(url));
    qbitSigningIn.set(url, signingIn);
  }
  return signingIn;
}

async function qbitJson<T>(url: string, path: string): Promise<T> {
  if (!qbitCookies.has(url)) await qbitSignIn(url);
  const used = qbitCookies.get(url);
  try {
    return await getJson<T>(`${url}${path}`, { Cookie: used! });
  } catch {
    // Its session may have run out: once more, signed in again, unless
    // another stat already has
    if (qbitCookies.get(url) === used) await qbitSignIn(url);
    return getJson<T>(`${url}${path}`, { Cookie: qbitCookies.get(url)! });
  }
}

type Torrent = {
  name: string;
  /** From 0 to 1 */
  progress: number;
  /** Bytes per second */
  dlspeed: number;
  upspeed: number;
  /** Seconds, or 8640000 for never */
  eta: number;
  ratio: number;
  /** "downloading", "uploading", "stalledDL"… */
  state: string;
};

/** What qBittorrent says when it can't tell when a torrent will finish. */
const NEVER = 8_640_000;

export const qbittorrent: App = {
  port: 8080,
  ready: () => !!env('QBITTORRENT_USERNAME') && !!env('QBITTORRENT_PASSWORD'),
  read: async ({ url }) => {
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
      // Moving data either way: downloading, or seeding to someone
      [
        'Active',
        async () =>
          (
            await qbitJson<unknown[]>(
              url,
              '/api/v2/torrents/info?filter=active'
            )
          ).length,
      ],
    ]);
  },
  details: async ({ url }) => {
    const torrents = await qbitJson<Torrent[]>(
      url,
      '/api/v2/torrents/info?filter=active&sort=dlspeed&reverse=true'
    );
    return [
      {
        kind: 'table',
        title: 'Active',
        columns: [
          { label: 'Name' },
          { label: 'Progress', numeric: true },
          { label: 'Speed', numeric: true },
          { label: 'Left', numeric: true },
          { label: 'Ratio', numeric: true },
        ],
        rows: torrents.map((t) => {
          const done = t.progress >= 1;
          return {
            cells: [
              t.name,
              { progress: t.progress },
              // Finished ones only send
              done
                ? `↑ ${formatRate(t.upspeed)}`
                : `↓ ${formatRate(t.dlspeed)}`,
              done ? 'done' : t.eta >= NEVER ? '∞' : formatDuration(t.eta),
              t.ratio.toFixed(2),
            ],
          };
        }),
        empty: 'Nothing’s moving',
      },
    ];
  },
};
