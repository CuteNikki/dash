import 'server-only';

import { openAlerts } from '@/lib/alerts/read';
import { can, seesGroup, type Role } from '@/lib/auth/roles';
import { DEFAULT_GROUP } from '@/lib/dashboard/groups';
import { currentSites } from '@/lib/dashboard/sites';
import { isSiteKey } from '@/lib/dashboard/tiles';
import { canBrowse, hasDetails, readWidgets } from '@/lib/dashboard/widgets';
import { db } from '@/lib/db';
import {
  listContainers,
  takingInput,
  type Container,
} from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';
import { formatMs, isLink, splitAddress } from '@/lib/format';
import { arrangeHostTiles } from '@/lib/host/host-tiles';
import { currentSystemUpdates } from '@/lib/host/system-updates';
import { currentUsage } from '@/lib/host/usage';
import { iconInfo } from '@/lib/icons/icon-search';
import { isImageUrl } from '@/lib/icons/icon-sets';
import { removable } from '@/lib/stacks/service-stacks';
import type { Dashboard, Service, SiteCheck } from '@/lib/types';
import { currentUpdates } from '@/lib/updates/check';

/**
 * A container's tile key: its compose project and service, which survive the
 * container being recreated, or its name for one started on its own.
 */
export function serviceKey(c: Container) {
  return c.stack ? `${c.stack.project}/${c.stack.service}` : c.name;
}

/**
 * The group a container's tile is in: the one it's been given here, else its
 * Homepage label's, else Other. What's shown and who may see it go by this.
 */
export function groupOf(c: Container, tile?: { group: string | null } | null) {
  return tile?.group || c.labels['homepage.group'] || DEFAULT_GROUP;
}

/** The first of some addresses that's a web link, without its label. */
function firstLink(addresses: string[]) {
  const entry = addresses.find(isLink);
  return entry && splitAddress(entry).address;
}

/** A tile's first web link, without its label, as one to request, if it's a valid one. */
export function siteUrl(addresses: string[]) {
  const link = firstLink(addresses);
  if (!link) return undefined;
  try {
    return new URL(link);
  } catch {
    return undefined;
  }
}

/**
 * A website elsewhere as a tile, as it was last found: up when it answers
 * without an error, down when it doesn't answer or answers with one, which
 * wants a look, unlike a container stopped on purpose.
 */
function siteService(
  tile: NonNullable<Awaited<ReturnType<typeof db.tile.findUnique>>>,
  check: SiteCheck | undefined
): Service {
  const url = siteUrl(tile.addresses);
  const status = !url
    ? 'No address to check'
    : !check
      ? 'Not checked yet'
      : check.ok
        ? `Answered ${check.status} in ${formatMs(check.ms)}`
        : check.status
          ? `Answered ${check.status}`
          : (check.error ?? 'No answer');
  return {
    key: tile.key,
    // Not a container, but where the rest of the dashboard looks for one
    containerId: tile.key,
    containerName: url?.host ?? 'No address',
    name: tile.name || url?.host || 'Site',
    group: tile.group || DEFAULT_GROUP,
    // The icon its page names until it's given one; its /favicon.ico before
    // the page has been read, and the letter if there's none
    icon: tile.icon || check?.icon || (url ? `${url.origin}/favicon.ico` : ''),
    addresses: tile.addresses,
    url: url?.href,
    description: tile.description || undefined,
    position: tile.position ?? undefined,
    width: tile.width,
    height: tile.height,
    hidden: tile.hidden,
    edited: true,
    image: '',
    state: !url
      ? 'dead'
      : !check
        ? 'starting'
        : check.ok
          ? 'running'
          : 'unhealthy',
    status,
    console: false,
    removable: false,
    site: { check },
  };
}

/**
 * The ports a container publishes on the server, each once though Docker
 * lists it for IPv4 and IPv6 apart, with its protocols together: 19132 on
 * udp and tcp.
 */
function publishedPorts(c: Container) {
  const byPort = new Map<number, Set<string>>();
  for (const p of c.ports) {
    if (!p.public) continue;
    byPort.set(p.public, (byPort.get(p.public) ?? new Set()).add(p.type));
  }
  return [...byPort]
    .sort(([a], [b]) => a - b)
    .map(([port, protocols]) => ({ port, protocols: [...protocols].sort() }));
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

/**
 * Homepage's icon labels name dashboard-icons files, e.g. "jellyfin.svg", or
 * are an image's address, which is kept whole.
 */
function iconName(label?: string) {
  if (label && isImageUrl(label)) return label;
  return label?.replace(/\.(svg|png|webp)$/, '') || undefined;
}

/**
 * Every container as a tile. What's been edited here comes first; the rest
 * comes from the container's Homepage labels, so the dashboard starts out
 * looking like Homepage did, then from its name.
 */
export async function getDashboard(who: {
  role: Role;
  groups: readonly string[];
}): Promise<Dashboard> {
  const [
    containers,
    { containers: usage, host, hostComing },
    tiles,
    groups,
    hostTiles,
    layouts,
  ] = await Promise.all([
    listContainers(),
    currentUsage(),
    db.tile.findMany(),
    db.group.findMany({ orderBy: { position: 'asc' } }),
    db.hostTile.findMany(),
    db.tileLayout.findMany(),
  ]);
  const edited = new Map(tiles.map((t) => [t.key, t]));
  const [consoles, widgets] = await Promise.all([
    takingInput(containers),
    readWidgets(containers),
  ]);

  // The development helper that reads the server's stats isn't a service, nor
  // is a container the dashboard runs for a moment, as to measure the disk
  const helper = process.env.HOST_HELPER_CONTAINER;
  const shown = containers.filter(
    (c) => c.name !== helper && !c.labels[RUN_LABEL]
  );
  const updates = currentUpdates(shown);
  const services = shown.map((c): Service => {
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
      group: groupOf(c, tile),
      icon:
        tile?.icon ||
        iconName(l['homepage.icon']) ||
        c.stack?.service ||
        c.name,
      addresses,
      url: firstLink(addresses),
      // Its own once edited here, if only to have none
      description:
        (tile?.description ?? l['homepage.description']) || undefined,
      position: tile?.position ?? undefined,
      width: tile?.width ?? 1,
      height: tile?.height ?? 1,
      hidden: tile?.hidden ?? false,
      edited: !!tile,
      image: c.image,
      state: c.state,
      status: c.status,
      stack: c.stack,
      removable: !!c.stack && removable(c.stack, containers),
      update: updates.byContainer.get(c.id)?.update,
      updateError: updates.byContainer.get(c.id)?.error,
      version: updates.byContainer.get(c.id)?.version,
      ports: publishedPorts(c),
      console: consoles.has(c.id),
      usage: u
        ? { cpu: u.cpu, memory: u.memory, history: u.history }
        : undefined,
      widget: widgets.get(c.id),
      details: hasDetails(c),
      browse: canBrowse(c),
    };
  });
  // Websites elsewhere, each a tile added here, with how it last answered
  const siteTiles = tiles.filter((t) => isSiteKey(t.key));
  const checks = await currentSites(
    siteTiles.flatMap((t) => siteUrl(t.addresses)?.href ?? [])
  );
  services.push(
    ...siteTiles.map((t) =>
      siteService(t, checks.get(siteUrl(t.addresses)?.href ?? ''))
    )
  );

  const icons = await iconInfo(services.map((s) => s.icon));
  for (const service of services) {
    const info = icons.get(service.icon);
    service.iconVariants = info?.variants;
    service.iconMissing = info?.missing;
  }
  // Only the groups they see, and the server itself only to those who may
  // look after it
  const seen = services.filter((s) => seesGroup(who, s.group));
  const keys = new Set(seen.map((s) => s.key));
  const server = can(who.role, 'server');
  return {
    services: seen,
    groupOrder: groups.map((g) => g.name).filter((g) => seesGroup(who, g)),
    hostTiles: server ? arrangeHostTiles(hostTiles) : [],
    layouts: layouts.filter(({ key }) =>
      key.startsWith(GROUP_SECTION)
        ? seesGroup(who, key.slice(GROUP_SECTION.length))
        : key.startsWith('host:') || key.startsWith('section:host')
          ? server
          : keys.has(key)
    ),
    host: server ? host : undefined,
    hostComing: server && hostComing,
    updates: { checkedAt: updates.checkedAt, checking: updates.checking },
    system: server ? currentSystemUpdates() : undefined,
    alerts: server ? await openAlerts() : undefined,
  };
}

/** A group's own place in the saved layouts. */
const GROUP_SECTION = 'section:group:';
