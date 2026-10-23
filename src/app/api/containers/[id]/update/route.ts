import { recordRun } from '@/lib/activity/record';
import { AccessError, refusal, serviceForRoute } from '@/lib/auth/access';
import { can } from '@/lib/auth/roles';
import { streamRun } from '@/lib/docker/run-stream';
import { updateService } from '@/lib/updates/apply';
import { updateOf } from '@/lib/updates/check';
import { updateLabel } from '@/lib/updates/describe';
import { selfUpdateStartedSince } from '@/lib/updates/self-update';

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
  const by = {
    who: { user: { id: access.user.id, name: access.user.name } },
    target: container.name,
    detail: update && updateLabel(update),
  };
  const began = Date.now();
  const { target, detail } = by;
  const done = recordRun(access, { action: 'update', target, detail });
  return streamRun(() => updateService(container, by), {
    // Unless it handed on to the dashboard's own rebuild, which notes itself
    done: async (exitCode, lastError) => {
      if (await selfUpdateStartedSince(began)) return;
      await done(exitCode, lastError);
    },
  });
}
