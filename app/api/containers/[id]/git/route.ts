import { unauthorized } from '@/lib/auth/session';
import { stackOf } from '@/lib/docker/stack-files';
import { gitStatus } from '@/lib/git';

/** How the repository the container's stack is in stands, or null for none. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/git'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const stack = await stackOf((await params).id);
  return Response.json(stack ? ((await gitStatus(stack.dir)) ?? null) : null);
}
