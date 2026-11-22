import { serviceForRoute } from '@/lib/auth/access';
import { serviceKey } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import { containerStorage } from '@/lib/host/service-storage';
import { KEEP_STORAGE_DAYS } from '@/lib/monitor/storage';
import type { ServiceStorage } from '@/lib/types';

const DAY_MS = 24 * 60 * 60_000;

/**
 * What a container keeps on the server's disk, see containerStorage, and
 * what it kept each day the monitor's measured it.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/storage'>
) {
  const found = await serviceForRoute((await params).id, 'view');
  if (found instanceof Response) return found;
  try {
    const [now, days] = await Promise.all([
      containerStorage(found.container),
      db.storageSample.findMany({
        where: {
          key: serviceKey(found.container),
          day: { gte: new Date(Date.now() - KEEP_STORAGE_DAYS * DAY_MS) },
        },
        orderBy: { day: 'asc' },
        select: { day: true, bytes: true },
      }),
    ]);
    const storage: ServiceStorage = {
      ...now,
      history: {
        at: days.map((d) => d.day.getTime()),
        bytes: days.map((d) => d.bytes),
      },
    };
    return Response.json(storage);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
