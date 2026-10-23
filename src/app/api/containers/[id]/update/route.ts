import { unauthorized } from '@/lib/auth/session';
import { listContainers } from '@/lib/docker/docker';
import { streamRun } from '@/lib/docker/run-stream';
import { updateService } from '@/lib/updates/apply';

/** Updates the container to what was last found for it, streaming what it does. See updateService. */
export async function POST(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/update'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await params;
  const container = (await listContainers()).find((c) => c.id === id);
  if (!container) {
    return Response.json(
      { error: 'That container no longer exists' },
      { status: 404 }
    );
  }
  return streamRun(() => updateService(container));
}
