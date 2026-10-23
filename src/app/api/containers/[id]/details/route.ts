import { serviceForRoute } from '@/lib/auth/access';
import { readDetails } from '@/lib/dashboard/widgets';

/** What a container's app has to say in its window, as DetailSection[]. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/details'>
) {
  const found = await serviceForRoute((await params).id, 'view');
  if (found instanceof Response) return found;
  try {
    const details = await readDetails(found.container);
    if (!details) {
      return Response.json(
        { error: 'This app has nothing more to show' },
        { status: 404 }
      );
    }
    return Response.json(details);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
