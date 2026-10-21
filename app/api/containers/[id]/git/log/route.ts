import { gitLog } from '@/lib/git';
import { unauthorized } from '@/lib/session';
import { stackOf } from '@/lib/stack-files';

/** Commits in one page of the history. */
const PAGE = 50;

/**
 * The branch's commits, newest first, a page at a time from ?skip=, and
 * whether there are older ones: { commits, more }.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/git/log'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const stack = await stackOf((await params).id);
  if (!stack) return Response.json({ error: 'No stack' }, { status: 404 });
  const skip = Math.max(
    0,
    Math.floor(Number(new URL(request.url).searchParams.get('skip')) || 0)
  );
  return Response.json(await gitLog(stack.dir, skip, PAGE));
}
