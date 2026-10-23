import { recordRun } from '@/lib/activity/record';
import { AccessError, refusal, serviceForRoute } from '@/lib/auth/access';
import { can } from '@/lib/auth/roles';
import { streamRun } from '@/lib/docker/run-stream';
import { updateService } from '@/lib/updates/apply';
import { updateOf } from '@/lib/updates/check';
import { updateLabel } from '@/lib/updates/describe';

/** Updates the container to what was last found for it, streaming what it does. See updateService. */
export async function POST(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/update'>
) {
  const found = await serviceForRoute((await params).id, 'control');
  if (found instanceof Response) return found;
  const { access, container } = found;
  // New commits rebuild the whole stack, whose other services may be in
  // groups they don't see, from whatever was pushed: only for those who may
  // change a stack's files
  const { update } = updateOf(container);
  if (update?.kind === 'commits' && !can(access.role, 'manage')) {
    return refusal(new AccessError(403));
  }
  return streamRun(() => updateService(container), {
    done: recordRun(access, {
      action: 'update',
      target: container.name,
      detail: update && updateLabel(update),
    }),
  });
}
