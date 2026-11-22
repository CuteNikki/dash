import 'server-only';

import type { Container } from '@/lib/docker/docker';
import { folderSizes } from '@/lib/host/disk-usage';

/** Whether a path is inside another, so it's counted with that one. */
const inside = (path: string, folder: string) =>
  path !== folder && path.startsWith(folder === '/' ? '/' : `${folder}/`);

/**
 * What a container keeps on the server's disk: each folder it mounts, and
 * each of Docker's volumes it uses, by size, biggest first. One inside
 * another it mounts is counted with that one, and the same one mounted
 * twice once.
 */
export async function containerStorage(container: Container) {
  const { mounts } = container;
  const sources = [...new Set(mounts.map((m) => m.source))];
  const outer = sources.filter((s) => !sources.some((o) => inside(s, o)));
  const sizes = await folderSizes(outer);
  const folders = mounts
    .filter((m) => outer.includes(m.source))
    .map((m) => ({ ...m, ...sizes.get(m.source) }))
    // Files and sockets, as a config file or Docker's, have no size
    .filter(
      (m): m is typeof m & { size: number; at: number } => m.size !== undefined
    )
    .filter((m, i, all) => all.findIndex((o) => o.source === m.source) === i)
    .sort((a, b) => b.size - a.size);
  return {
    total: folders.reduce((sum, m) => sum + m.size, 0),
    measuredAt: folders.length
      ? Math.min(...folders.map((m) => m.at))
      : undefined,
    folders: folders.map(({ source, destination, size }) => ({
      source,
      destination,
      size,
    })),
  };
}
