import {
  AccessError,
  getAccess,
  refusal,
  seesGroup,
  serviceForRoute,
} from '@/lib/auth/access';
import { can } from '@/lib/auth/roles';
import { DEFAULT_GROUP } from '@/lib/dashboard/groups';
import { siteUrl } from '@/lib/dashboard/services';
import { isSiteKey } from '@/lib/dashboard/tiles';
import { readDetails, remoteAppOf } from '@/lib/dashboard/widgets';
import { db } from '@/lib/db';
import type { DetailSection } from '@/lib/types';

/**
 * What a container's app has to say in its window, as DetailSection[]; or,
 * for a website tile's key, what the app on another machine on its host has.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/details'>
) {
  const id = decodeURIComponent((await params).id);
  let details: () => Promise<DetailSection[] | undefined>;
  if (isSiteKey(id)) {
    const access = await getAccess();
    if (!access) return refusal(new AccessError(401));
    if (!can(access.role, 'view')) return refusal(new AccessError(403));
    const tile = await db.tile.findUnique({
      where: { key: id },
      select: { group: true, addresses: true },
    });
    if (!tile || !seesGroup(access, tile.group || DEFAULT_GROUP)) {
      return refusal(new AccessError(404));
    }
    const app = remoteAppOf(siteUrl(tile.addresses));
    details = async () => app?.details();
  } else {
    const found = await serviceForRoute(id, 'view');
    if (found instanceof Response) return found;
    details = () => readDetails(found.container);
  }
  try {
    const sections = await details();
    if (!sections) {
      return Response.json(
        { error: 'This app has nothing more to show' },
        { status: 404 }
      );
    }
    return Response.json(sections);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
