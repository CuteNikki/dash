import type { Container } from '@/lib/docker/docker';

/** The longest a tile's description can be: a line under its name. */
export const MAX_DESCRIPTION = 120;

/** A tile that's a website elsewhere, checked over HTTP, rather than a container here. */
export const SITE_PREFIX = 'site:';

export function isSiteKey(key: string) {
  return key.startsWith(SITE_PREFIX);
}

/**
 * A container's tile key: its compose project and service, which survive the
 * container being recreated, or its name for one started on its own.
 */
export function serviceKey(c: Container) {
  return c.stack ? `${c.stack.project}/${c.stack.service}` : c.name;
}

/**
 * What a tile can show at its foot, each as a number, a graph or both: a
 * container's CPU, memory, network and disk, and a website's response time
 * and what it answered, which is only a number.
 */
export const TILE_ITEMS = [
  'cpu',
  'memory',
  'network',
  'disk',
  'response',
  'status',
] as const;

export type TileItem = (typeof TILE_ITEMS)[number];

/** Which of a tile's readings it shows as numbers, and which as graphs. */
export type TileFoot = { numbers: TileItem[]; graphs: TileItem[] };

/** What a container's and a website's tiles have, in the order they show them */
export const FOOT_ITEMS = {
  container: ['cpu', 'memory', 'network', 'disk'],
  site: ['response', 'status'],
} as const satisfies Record<string, readonly TileItem[]>;

/** Those that have no graph, being words, not amounts */
export const NUMBER_ONLY: readonly TileItem[] = ['status'];

/** What a tile shows until it's picked otherwise: what it always did */
export const DEFAULT_FOOT: Record<keyof typeof FOOT_ITEMS, TileFoot> = {
  container: { numbers: ['cpu', 'memory'], graphs: ['cpu', 'memory'] },
  site: { numbers: ['response', 'status'], graphs: ['response'] },
};

/**
 * A tile's foot as it was saved, held to what its kind has, or its
 * default when it was never picked, or was saved some other way.
 */
export function footOf(saved: unknown, site: boolean): TileFoot {
  const kind = site ? 'site' : 'container';
  const items: readonly TileItem[] = FOOT_ITEMS[kind];
  const pick = (list: unknown) =>
    Array.isArray(list) ? items.filter((i) => list.includes(i)) : undefined;
  const value = saved as Partial<Record<keyof TileFoot, unknown>> | null;
  const numbers = pick(value?.numbers);
  const graphs = pick(value?.graphs)?.filter((g) => !NUMBER_ONLY.includes(g));
  return numbers && graphs ? { numbers, graphs } : DEFAULT_FOOT[kind];
}
