import { serviceForRoute } from '@/lib/auth/access';
import { folderSizes } from '@/lib/host/disk-usage';
import type { ServiceStorage } from '@/lib/types';

/** Whether a path is inside another, so it's counted with that one. */
const inside = (path: string, folder: string) =>
  path !== folder && path.startsWith(folder === '/' ? '/' : `${folder}/`);

/**
 * What a container keeps on the server's disk: each folder it mounts, and
 * each of Docker's volumes it uses, by size, biggest first. One inside
 * another it mounts is counted with that one.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/storage'>
) {
  const found = await serviceForRoute((await params).id, 'view');
  if (found instanceof Response) return found;
  const mounts = found.container.mounts;
  const sources = [...new Set(mounts.map((m) => m.source))];
  const outer = sources.filter((s) => !sources.some((o) => inside(s, o)));
  try {
    const sizes = await folderSizes(outer);
    const measured = mounts
      .filter((m) => outer.includes(m.source))
      .map((m) => ({ ...m, ...sizes.get(m.source) }))
      // Files and sockets, as a config file or Docker's, have no size
      .filter(
        (m): m is typeof m & { size: number; at: number } =>
          m.size !== undefined
      )
      // The same folder mounted twice is counted once
      .filter((m, i, all) => all.findIndex((o) => o.source === m.source) === i)
      .sort((a, b) => b.size - a.size);
    const storage: ServiceStorage = {
      total: measured.reduce((sum, m) => sum + m.size, 0),
      measuredAt: measured.length
        ? Math.min(...measured.map((m) => m.at))
        : undefined,
      folders: measured.map(({ source, destination, size }) => ({
        source,
        destination,
        size,
      })),
    };
    return Response.json(storage);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
