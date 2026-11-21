import 'server-only';

import { inTime, type App } from '@/lib/apps/app';
import { isRunning } from '@/lib/dashboard/status';
import { isSiteKey, serviceKey } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import { listContainers } from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';

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

/** Its own numbers, the window counting rather than naming its users. */
export const dashboard: App = {
  read: async () => {
    const o = await read();
    return [
      { label: 'Services', value: `${o.services}` },
      { label: 'Websites', value: `${o.sites}` },
      { label: 'Users', value: `${o.users}` },
      { label: 'Alerts', value: `${o.alerts}` },
    ];
  },
  details: async () => {
    const o = await read();
    return [
      {
        kind: 'facts',
        title: 'On the dashboard',
        facts: [
          {
            label: 'Services',
            value: `${o.running} of ${o.services} running`,
          },
          { label: 'Websites', value: `${o.sites}` },
          {
            label: 'Hidden',
            value: `${o.hiddenServices} services, ${o.hiddenSites} websites`,
          },
          { label: 'Open alerts', value: `${o.alerts}` },
        ],
      },
      {
        kind: 'facts',
        title: 'Dashboard',
        facts: [
          { label: 'Users', value: `${o.users}` },
          { label: 'Signed in', value: `${o.sessions} sessions` },
          {
            label: 'Last backup',
            value: o.backup ? { at: o.backup.startedAt.getTime() } : 'None yet',
          },
          ...(o.backup && !backupOk(o.backup.results)
            ? [{ label: 'Backup errors', value: 'Some parts failed' }]
            : []),
        ],
      },
    ];
  },
};
