import { listContainers } from '@/lib/docker';
import { removeService } from '@/lib/remove-service';
import { streamRun } from '@/lib/run-stream';
import { removable } from '@/lib/service-stacks';
import { unauthorized } from '@/lib/session';
import { stackOf } from '@/lib/stack-files';

/**
 * Removes the container's whole stack, streaming what it does; with ?files=1
 * its folder and volumes too. See removeService.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/remove'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const stack = await stackOf((await params).id);
  if (!stack) {
    return Response.json(
      { error: 'This container isn’t part of a compose stack' },
      { status: 404 }
    );
  }
  if (!removable(stack, await listContainers())) {
    return Response.json(
      { error: 'Only a service of its own in ~/services can be removed here' },
      { status: 403 }
    );
  }
  const files = new URL(request.url).searchParams.get('files') === '1';
  return streamRun(() => removeService(stack, { files }));
}
