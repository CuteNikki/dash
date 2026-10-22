import 'server-only';

import { db } from '@/lib/db';
import { listContainers, takingInput, type Container } from '@/lib/docker';
import { isLink } from '@/lib/format';
import { DEFAULT_GROUP } from '@/lib/groups';
import { iconInfo } from '@/lib/icon-search';
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

/** Addresses from a container's Homepage link label, before it's edited. */
function labelAddresses(c: Container) {
  const href = c.labels['homepage.href'];
  return href ? [href] : [];
}

/**
 * Gives tiles that haven't been edited a row, so they can be placed or
 * sized. Since an edited tile has its own addresses, each starts with the
 * one from its labels.
 */
export async function ensureTiles(keys: string[]) {
  const have = new Set(
    (
      await db.tile.findMany({
        where: { key: { in: keys } },
        select: { key: true },
      })
    ).map((t) => t.key)
  );
  const missing = new Set(keys.filter((k) => !have.has(k)));
  if (!missing.size) return;
  const containers = await listContainers();
  await db.tile.createMany({
    data: containers
      .filter((c) => missing.has(serviceKey(c)))
      .map((c) => ({ key: serviceKey(c), addresses: labelAddresses(c) })),
    skipDuplicates: true,
  });
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
  const [containers, { containers: usage, host, hostComing }, tiles, groups] =
    await Promise.all([
      listContainers(),
      currentUsage(),
      db.tile.findMany(),
      db.group.findMany({ orderBy: { position: 'asc' } }),
    ]);
  const edited = new Map(tiles.map((t) => [t.key, t]));
  const consoles = await takingInput(containers);

  // The development helper that reads the server's stats isn't a service
  const helper = process.env.HOST_HELPER_CONTAINER;
  const services = containers
    .filter((c) => c.name !== helper)
    .map((c): Service => {
      const l = c.labels;
      const key = serviceKey(c);
      const tile = edited.get(key);
      const u = usage.get(c.id);
      // A tile edited here has its own addresses, even none
      const addresses = tile ? tile.addresses : labelAddresses(c);
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
        addresses,
        url: addresses.find(isLink),
        description: l['homepage.description'] || undefined,
        position: tile?.position ?? undefined,
        width: tile?.width ?? 1,
        height: tile?.height ?? 1,
        hidden: tile?.hidden ?? false,
        edited: !!tile,
        image: c.image,
        state: c.state,
        status: c.status,
        stack: c.stack,
        console: consoles.has(c.id),
        usage: u
          ? { cpu: u.cpu, memory: u.memory, history: u.history }
          : undefined,
      };
    });
  const icons = await iconInfo(services.map((s) => s.icon));
  for (const service of services) {
    const info = icons.get(service.icon);
    service.iconVariants = info?.variants;
    service.iconMissing = info?.missing;
  }
  return {
    services,
    groupOrder: groups.map((g) => g.name),
    host,
    hostComing,
  };
}
