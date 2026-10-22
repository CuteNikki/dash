import { unauthorized } from '@/lib/auth/session';
import { stackOf } from '@/lib/docker/stack-files';
import { gitCommitDetails } from '@/lib/git';

/** One commit: who made it and when, its whole message, and the files it changed. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/git/commits/[hash]'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id, hash } = await params;
  const stack = await stackOf(id);
  const details = stack && (await gitCommitDetails(stack.dir, hash));
  if (!details)
    return Response.json({ error: 'No such commit' }, { status: 404 });
  return Response.json(details);
}
