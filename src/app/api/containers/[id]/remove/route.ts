import { denied } from '@/lib/auth/access';
import { listContainers } from '@/lib/docker/docker';
import { streamRun } from '@/lib/docker/run-stream';
import { stackOf } from '@/lib/docker/stack-files';
import { removeService } from '@/lib/stacks/remove-service';
import { removable } from '@/lib/stacks/service-stacks';

/**
 * Removes the container's whole stack, streaming what it does; with ?files=1
 * its folder and volumes too. See removeService.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/remove'>
) {
  const refused = await denied('manage');
  if (refused) return refused;
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
