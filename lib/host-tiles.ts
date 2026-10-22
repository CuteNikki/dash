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

export type HostTile = {
  key: HostTileKey;
  name: string;
  width: number;
  height: number;
};

export function isHostTileKey(key: string): key is HostTileKey {
  return HOST_TILES.some((t) => t.key === key);
}

/**
 * The server's tiles as arranged: those that have been placed in their
 * order, at their sizes, the rest after them as they first were.
 */
export function arrangeHostTiles(
  saved: { key: string; position: number; width: number; height: number }[]
): HostTile[] {
  const placed = new Map(saved.map((s) => [s.key, s]));
  return HOST_TILES.map((t, i) => {
    const s = placed.get(t.key);
    return {
      tile: { ...t, width: s?.width ?? t.width, height: s?.height ?? t.height },
      rank: s ? s.position : HOST_TILES.length + i,
    };
  })
    .sort((a, b) => a.rank - b.rank)
    .map((t) => t.tile);
}
