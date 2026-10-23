import { unauthorized } from '@/lib/auth/session';
import { readDetails } from '@/lib/dashboard/widgets';
import { listContainers } from '@/lib/docker/docker';

/** What a container's app has to say in its window, as DetailSection[]. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/details'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await params;
  const container = (await listContainers()).find((c) => c.id === id);
  try {
    const details = container && (await readDetails(container));
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
