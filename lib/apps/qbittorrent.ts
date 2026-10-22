import 'server-only';

import {
  env,
  getJson,
  once,
  stats,
  TIMEOUT_MS,
  type App,
} from '@/lib/apps/app';
import { formatRate } from '@/lib/format';

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
    ]);
  },
};
