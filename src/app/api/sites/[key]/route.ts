import { AccessError, getAccess, refusal, seesGroup } from '@/lib/auth/access';
import { can } from '@/lib/auth/roles';
import { DEFAULT_GROUP } from '@/lib/dashboard/groups';
import { isSiteKey } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import { isHistoryRange } from '@/lib/monitor/ranges';
import { siteUptime } from '@/lib/monitor/uptime';

/**
 * A website tile's uptime over the last day, week and month, its outages,
 * and its response time over ?range=, as SiteUptime: for whoever sees its group.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/sites/[key]'>
) {
  const access = await getAccess();
  if (!access) return refusal(new AccessError(401));
  if (!can(access.role, 'view')) return refusal(new AccessError(403));
  const key = decodeURIComponent((await params).key);
  const tile = isSiteKey(key)
    ? await db.tile.findUnique({ where: { key }, select: { group: true } })
    : null;
  if (!tile || !seesGroup(access, tile.group || DEFAULT_GROUP)) {
    return refusal(new AccessError(404));
  }
  const range = new URL(request.url).searchParams.get('range');
  if (!isHistoryRange(range)) {
    return Response.json({ error: 'Unknown range' }, { status: 400 });
  }
  return Response.json(await siteUptime(key, range));
}
