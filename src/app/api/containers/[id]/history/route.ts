import { serviceForRoute } from '@/lib/auth/access';
import { serviceKey } from '@/lib/dashboard/services';
import { serviceHistory } from '@/lib/monitor/history';
import { isHistoryRange } from '@/lib/monitor/ranges';

/** A service's CPU and memory over ?range=, from the monitor's record, as ServiceHistory. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/history'>
) {
  const found = await serviceForRoute((await params).id, 'view');
  if (found instanceof Response) return found;
  const range = new URL(request.url).searchParams.get('range');
  if (!isHistoryRange(range)) {
    return Response.json({ error: 'Unknown range' }, { status: 400 });
  }
  return Response.json(
    await serviceHistory(serviceKey(found.container), range)
  );
}
