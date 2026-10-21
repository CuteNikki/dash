import 'server-only';

import { listContainers, type Container } from '@/lib/docker';
import { DEFAULT_GROUP } from '@/lib/groups';
import type { Service } from '@/lib/types';
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
 * Every container as a tile. Until a tile is edited here, its name, group,
 * icon and link come from its Homepage labels, so the dashboard starts out
 * looking like Homepage did.
 */
export async function getServices(): Promise<Service[]> {
  const [containers, usage] = await Promise.all([
    listContainers(),
    currentUsage(),
  ]);
  return containers.map((c) => {
    const l = c.labels;
    const u = usage.get(c.id);
    return {
      key: serviceKey(c),
      containerId: c.id,
      containerName: c.name,
      name: l['homepage.name'] || prettyName(c),
      group: l['homepage.group'] || DEFAULT_GROUP,
      icon: iconName(l['homepage.icon']) ?? c.stack?.service ?? c.name,
      url: l['homepage.href'] || undefined,
      description: l['homepage.description'] || undefined,
      image: c.image,
      state: c.state,
      status: c.status,
      stack: c.stack,
      usage: u
        ? { cpu: u.cpu, memory: u.memory, history: u.history }
        : undefined,
    };
  });
}
