import { denied } from '@/lib/auth/access';
import { stackOf } from '@/lib/docker/stack-files';
import { gitStatus } from '@/lib/git';

/** How the repository the container's stack is in stands, or null for none. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/git'>
) {
  const refused = await denied('manage');
  if (refused) return refused;
  const stack = await stackOf((await params).id);
  return Response.json(stack ? ((await gitStatus(stack.dir)) ?? null) : null);
}
