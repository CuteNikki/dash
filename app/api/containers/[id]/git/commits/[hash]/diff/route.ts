import { unauthorized } from '@/lib/auth/session';
import { stackOf } from '@/lib/docker/stack-files';
import { gitCommitDiff } from '@/lib/git';

/**
 * What one commit changed in one file, ?path= relative to the repository.
 * Read from git's own history, so no path reaches anything outside it.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/git/commits/[hash]/diff'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id, hash } = await params;
  const stack = await stackOf(id);
  const path = new URL(request.url).searchParams.get('path');
  if (!stack || !path) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return Response.json(await gitCommitDiff(stack.dir, hash, path));
}
