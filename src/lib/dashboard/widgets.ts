import 'server-only';

import { APPS, REMOTE_APPS } from '@/lib/apps';
import { env, type AppContext, type RemoteApp } from '@/lib/apps/app';
import { devTunnelUrl } from '@/lib/apps/tunnels';
import { isRunning } from '@/lib/dashboard/status';
import { isSiteKey } from '@/lib/dashboard/tiles';
import type { Container } from '@/lib/docker/docker';
import { imageName } from '@/lib/format';
import { hasStorageKey } from '@/lib/storage';
import type { Widget, WidgetStat } from '@/lib/types';

/** How long an app's numbers are kept before it's asked again. */
const FRESH_MS = 10_000;

/** "lscr.io/linuxserver/sonarr:latest" → "sonarr" */
function appOf(c: Container) {
  // A dash.app label names it outright, for an image named for its folder
  const name = c.labels['dash.app'] ?? imageName(c.image);
  // Its own keys only: a label of "toString" isn't an app
  return Object.hasOwn(APPS, name) ? name : undefined;
}

/**
 * Where an app is: its container, and for one read over HTTP, SONARR_URL
 * and so on, or its container by name on a network the dashboard shares with it;
 * in development, its tunnel from `bun run tunnels`. qBittorrent behind a VPN
 * container needs its URL set on the server, to the VPN container's name.
 */
function contextOf(app: string, c: Container): AppContext {
  const { port } = APPS[app];
  return {
    container: c,
    url:
      // "ludo-server" → LUDO_SERVER_URL
      env(`${app.toUpperCase().replace(/\W/g, '_')}_URL`)?.replace(/\/$/, '') ??
      (process.env.NODE_ENV === 'development'
        ? devTunnelUrl(app)
        : undefined) ??
      (port ? `http://${c.name}:${port}` : ''),
  };
}

type Cached = { at: number; widget?: Widget; pending?: Promise<void> };

// By container, so two of the same app have their own, and by tile key for
// a website's app on another machine. Kept on globalThis
// so development's hot reloads keep them
const cache: Map<string, Cached> = ((
  globalThis as typeof globalThis & { widgetCache?: Map<string, Cached> }
).widgetCache ??= new Map());

function refresh(id: string, read: () => Promise<WidgetStat[]>) {
  const entry = cache.get(id);
  if (entry?.pending) return entry.pending;
  const pending = read()
    .then(
      (stats): Widget => ({ stats }),
      (e: unknown): Widget => ({
        error: e instanceof Error ? e.message : String(e),
      })
    )
    .then((widget) => {
      cache.set(id, { at: Date.now(), widget });
    });
  cache.set(id, { at: entry?.at ?? 0, widget: entry?.widget, pending });
  return pending;
}

/**
 * Each app's numbers, by id: those already read at once, even a little old,
 * while newer ones are fetched; only the first wait for the app.
 */
async function readAll(
  found: { id: string; read: () => Promise<WidgetStat[]> }[]
) {
  await Promise.all(
    found.map(({ id, read }) => {
      const entry = cache.get(id);
      if (entry && Date.now() - entry.at < FRESH_MS) return;
      const pending = refresh(id, read);
      // Only the first reading is waited for
      return entry?.widget ? undefined : pending;
    })
  );
  return new Map(
    found.flatMap(({ id }) => {
      const widget = cache.get(id)?.widget;
      return widget ? [[id, widget]] : [];
    })
  );
}

/**
 * Live numbers for each running container whose app has a widget and its
 * keys set, by container id. Numbers already read come back at once, even a
 * little old, while newer ones are fetched; only the first wait for the app.
 */
export async function readWidgets(
  containers: Container[]
): Promise<Map<string, Widget>> {
  // A container removed, or recreated with a new id, takes its numbers with it
  const ids = new Set(containers.map((c) => c.id));
  for (const id of cache.keys()) {
    if (!isSiteKey(id) && !ids.has(id)) cache.delete(id);
  }
  return readAll(
    containers.flatMap((c) => {
      const app = appOf(c);
      return app && isRunning(c.state) && (APPS[app].ready?.() ?? true)
        ? [{ id: c.id, read: () => APPS[app].read(contextOf(app, c)) }]
        : [];
    })
  );
}

/** The app on another machine whose host a website tile's address is on, if any. */
export function remoteAppOf(url: URL | undefined) {
  return url && REMOTE_APPS.find((app) => app.url()?.host === url.host);
}

/** Live numbers for each website tile showing an app on another machine, by tile key. */
export async function readSiteWidgets(
  sites: { key: string; app: RemoteApp }[]
): Promise<Map<string, Widget>> {
  // A website removed, or no longer on the app's host, takes its numbers with it
  const keys = new Set(sites.map((s) => s.key));
  for (const id of cache.keys()) {
    if (isSiteKey(id) && !keys.has(id)) cache.delete(id);
  }
  return readAll(sites.map(({ key, app }) => ({ id: key, read: app.read })));
}

/** A container's app's own icon, as a bot's avatar, once it's been read. */
export function appIcon(c: Container) {
  const app = appOf(c);
  return app ? APPS[app].icon?.(contextOf(app, c)) : undefined;
}

/** Whether a container's app has more to show in its window, with its keys set to read it. */
export function hasDetails(c: Container) {
  const app = appOf(c);
  return !!app && !!APPS[app].details && (APPS[app].ready?.() ?? true);
}

/** Whether what a container stores can be browsed: Garage's buckets, with the dashboard's key to them. */
export function canBrowse(c: Container) {
  return appOf(c) === 'garage' && hasStorageKey();
}

/** What a container's app has to say in its window, or nothing for one that has none. */
export async function readDetails(c: Container) {
  const app = appOf(c);
  if (!app || !hasDetails(c)) return undefined;
  return APPS[app].details!(contextOf(app, c));
}
