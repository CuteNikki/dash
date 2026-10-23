import 'server-only';

import { APPS } from '@/lib/apps';
import { env, type AppContext } from '@/lib/apps/app';
import { isRunning } from '@/lib/dashboard/status';
import type { Container } from '@/lib/docker/docker';
import { imageName } from '@/lib/format';
import type { Widget } from '@/lib/types';

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
 * and so on, or its container by name on a network dash shares with it.
 * qBittorrent behind a VPN container needs its URL set, to the VPN
 * container's name.
 */
function contextOf(app: string, c: Container): AppContext {
  const { port } = APPS[app];
  return {
    container: c,
    url:
      // "ludo-server" → LUDO_SERVER_URL
      env(`${app.toUpperCase().replace(/\W/g, '_')}_URL`)?.replace(/\/$/, '') ??
      (port ? `http://${c.name}:${port}` : ''),
  };
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
  const pending = APPS[app]
    .read(contextOf(app, c))
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
  // A container removed, or recreated with a new id, takes its numbers with it
  const ids = new Set(containers.map((c) => c.id));
  for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
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

/** Whether a container's app has more to show in its window, with its keys set to read it. */
export function hasDetails(c: Container) {
  const app = appOf(c);
  return !!app && !!APPS[app].details && (APPS[app].ready?.() ?? true);
}

/** What a container's app has to say in its window, or nothing for one that has none. */
export async function readDetails(c: Container) {
  const app = appOf(c);
  if (!app || !hasDetails(c)) return undefined;
  return APPS[app].details!(contextOf(app, c));
}
