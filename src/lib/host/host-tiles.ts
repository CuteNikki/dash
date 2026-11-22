/** The server's tiles, in their first order and at their first sizes. */
export const HOST_TILES = [
  { key: 'server', name: 'Server', width: 8, height: 1 },
  // CPU beside the processes using it
  { key: 'cpu', name: 'CPU', width: 1, height: 1 },
  { key: 'processes', name: 'Processes', width: 3, height: 1 },
  // Then memory, the disk twice over, and the network
  { key: 'memory', name: 'Memory', width: 1, height: 1 },
  { key: 'disk', name: 'Disk', width: 1, height: 1 },
  { key: 'disk-io', name: 'Disk I/O', width: 1, height: 1 },
  { key: 'network', name: 'Network', width: 1, height: 1 },
] as const;

export type HostTileKey = (typeof HOST_TILES)[number]['key'];

/**
 * What a tile's graph can show, in the order its switch has them: the CPU's
 * total or each thread, and either flow of the network's and the disk's,
 * or both.
 */
export const HOST_TILE_VIEWS = {
  cpu: ['total', 'cores'],
  network: ['0', '1', 'both'],
  'disk-io': ['0', '1', 'both'],
} as const satisfies Partial<Record<HostTileKey, readonly string[]>>;

export type HostTileView<K extends keyof typeof HOST_TILE_VIEWS> =
  (typeof HOST_TILE_VIEWS)[K][number];

/** What each shows until another's been picked */
const FIRST_VIEW: { [K in keyof typeof HOST_TILE_VIEWS]: HostTileView<K> } = {
  cpu: 'total',
  network: 'both',
  'disk-io': 'both',
};

export type HostTile = {
  key: HostTileKey;
  name: string;
  width: number;
  height: number;
  /** Left off the board, other than while arranging it */
  hidden: boolean;
  /** What its graph shows at first, if it's been picked */
  view?: string;
};

export function hasViews(
  key: HostTileKey
): key is keyof typeof HOST_TILE_VIEWS {
  return key in HOST_TILE_VIEWS;
}

/** The view a tile was set to show, or its first where it wasn't or can't. */
export function viewOf<K extends keyof typeof HOST_TILE_VIEWS>(
  key: K,
  view?: string
): HostTileView<K> {
  const views: readonly string[] = HOST_TILE_VIEWS[key];
  return view && views.includes(view)
    ? (view as HostTileView<K>)
    : FIRST_VIEW[key];
}

export function isHostTileKey(key: string): key is HostTileKey {
  return HOST_TILES.some((t) => t.key === key);
}

/**
 * The server's tiles as arranged: those that have been placed in their
 * order, at their sizes, the rest after them as they first were; each
 * hidden or not, and showing what it was set to.
 */
export function arrangeHostTiles(
  saved: {
    key: string;
    position: number | null;
    width: number | null;
    height: number | null;
    hidden: boolean;
    view: string | null;
  }[]
): HostTile[] {
  const changed = new Map(saved.map((s) => [s.key, s]));
  return HOST_TILES.map((t, i) => {
    const s = changed.get(t.key);
    return {
      tile: {
        ...t,
        width: s?.width ?? t.width,
        height: s?.height ?? t.height,
        hidden: s?.hidden ?? false,
        view: s?.view ?? undefined,
      },
      rank: s?.position ?? HOST_TILES.length + i,
    };
  })
    .sort((a, b) => a.rank - b.rank)
    .map((t) => t.tile);
}
