import 'server-only';

import { inTime, type App } from '@/lib/apps/app';
import { isRunning } from '@/lib/dashboard/status';
import { isSiteKey, serviceKey } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import { listContainers } from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';
import type { DetailSection } from '@/lib/types';

/**
 * What the dashboard itself keeps: the services and websites on it, its
 * users and open alerts. Counted from Docker and its database rather than
 * from the dashboard's own list, which reads this widget as it's made.
 */
async function overview() {
  const helper = process.env.HOST_HELPER_CONTAINER;
  const [containers, tiles, users, sessions, alerts, backup] =
    await Promise.all([
      listContainers(),
      db.tile.findMany({ select: { key: true, hidden: true } }),
      db.user.count(),
      db.session.count({ where: { expiresAt: { gt: new Date() } } }),
      db.alert.count({ where: { resolvedAt: null } }),
      db.backupRun.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
  const hidden = new Set(tiles.filter((t) => t.hidden).map((t) => t.key));
  // As the dashboard lists them: not the development helper, nor one it runs
  // for a moment
  const services = containers.filter(
    (c) => c.name !== helper && !c.labels[RUN_LABEL]
  );
  const sites = tiles.filter((t) => isSiteKey(t.key));
  const shown = services.filter((c) => !hidden.has(serviceKey(c)));
  return {
    services: shown.length,
    running: shown.filter((c) => isRunning(c.state)).length,
    hiddenServices: services.length - shown.length,
    sites: sites.filter((t) => !t.hidden).length,
    hiddenSites: sites.filter((t) => t.hidden).length,
    users,
    sessions,
    alerts,
    backup,
  };
}

const read = () => inTime(overview(), 'The dashboard');

/** Whether each part of a backup run went right, as it kept them. */
function backupOk(results: unknown) {
  return (
    Array.isArray(results) &&
    results.every((r) => (r as { ok?: boolean } | null)?.ok === true)
  );
}

/**
 * Its own numbers, the window counting rather than naming its users. Its
 * websites are the tiles of sites hosted elsewhere, which a tile can leave
 * off, as a group named Websites may hold containers that aren't among them.
 */
export const dashboard: App = {
  read: async () => {
    const o = await read();
    return [
      { label: 'services', value: { number: o.services } },
      { label: 'websites', value: { number: o.sites } },
      { label: 'users', value: { number: o.users } },
      { label: 'alerts', value: { number: o.alerts } },
    ];
  },
  details: async (): Promise<DetailSection[]> => {
    const o = await read();
    return [
      {
        kind: 'facts',
        title: 'onTheDashboard',
        facts: [
          {
            label: 'services',
            value: {
              text: 'runningOf',
              values: { running: o.running, count: o.services },
            },
          },
          { label: 'websitesElsewhere', value: { number: o.sites } },
          {
            label: 'hidden',
            value: {
              text: 'hiddenTiles',
              values: { services: o.hiddenServices, sites: o.hiddenSites },
            },
          },
          { label: 'openAlerts', value: { number: o.alerts } },
        ],
      },
      {
        kind: 'facts',
        title: 'dashboard',
        facts: [
          { label: 'users', value: { number: o.users } },
          {
            label: 'signedIn',
            value: { text: 'sessions', values: { count: o.sessions } },
          },
          {
            label: 'lastBackup',
            value: o.backup
              ? { at: o.backup.startedAt.getTime() }
              : { text: 'noneYet' },
          },
          ...(o.backup && !backupOk(o.backup.results)
            ? [
                {
                  label: 'backupErrors' as const,
                  value: { text: 'somePartsFailed' as const },
                },
              ]
            : []),
        ],
      },
    ];
  },
};
