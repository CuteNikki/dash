import 'server-only';

import { db } from '@/lib/db';
import { listContainers, type Container } from '@/lib/docker';
import { DEFAULT_GROUP } from '@/lib/groups';
import type { Dashboard, Service } from '@/lib/types';
import { currentUsage } from '@/lib/usage';

/**
 * A container's tile key: its compose project and service, which survive the
 * container being recreated, or its name for one started on its own.
 */
export function serviceKey(c: Container) {
  return c.stack ? `${c.stack.project}/${c.stack.service}` : c.name;
}

/** "poke-helper" or "papermc-minecraft-paper-1" as a name to show. */
function prettyName(c: Container) {
  const base = c.stack?.service ?? c.name;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Homepage's icon labels name dashboard-icons files, e.g. "jellyfin.svg". */
function iconName(label?: string) {
  return label?.replace(/\.(svg|png|webp)$/, '') || undefined;
}

/**
 * Every container as a tile. What's been edited here comes first; the rest
 * comes from the container's Homepage labels, so the dashboard starts out
 * looking like Homepage did, then from its name.
 */
export async function getDashboard(): Promise<Dashboard> {
  const [containers, usage, tiles, groups] = await Promise.all([
    listContainers(),
    currentUsage(),
    db.tile.findMany(),
    db.group.findMany({ orderBy: { position: 'asc' } }),
  ]);
  const edited = new Map(tiles.map((t) => [t.key, t]));

  const services = containers.map((c): Service => {
    const l = c.labels;
    const key = serviceKey(c);
    const tile = edited.get(key);
    const u = usage.get(c.id);
    // An empty link saved here means "no link", not "use the label's"
    const url = tile?.url != null ? tile.url : l['homepage.href'];
    return {
      key,
      containerId: c.id,
      containerName: c.name,
      name: tile?.name || l['homepage.name'] || prettyName(c),
      group: tile?.group || l['homepage.group'] || DEFAULT_GROUP,
      icon:
        tile?.icon ||
        iconName(l['homepage.icon']) ||
        c.stack?.service ||
        c.name,
      url: url || undefined,
      description: l['homepage.description'] || undefined,
      position: tile?.position ?? undefined,
      hidden: tile?.hidden ?? false,
      edited: !!tile,
      image: c.image,
      state: c.state,
      status: c.status,
      stack: c.stack,
      usage: u
        ? { cpu: u.cpu, memory: u.memory, history: u.history }
        : undefined,
    };
  });
  return { services, groupOrder: groups.map((g) => g.name) };
}
