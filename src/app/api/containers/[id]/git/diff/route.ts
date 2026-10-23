import { denied } from '@/lib/auth/access';
import { stackOf } from '@/lib/docker/stack-files';
import { gitDiff, gitStatus } from '@/lib/git';

/** What changed in one of the repository's changed files, ?path= relative to it. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/git/diff'>
) {
  const refused = await denied('manage');
  if (refused) return refused;
  const stack = await stackOf((await params).id);
  const status = stack && (await gitStatus(stack.dir));
  const path = new URL(request.url).searchParams.get('path') ?? '';
  // Only a file git says changed, so no other path gets through
  if (!status?.changes.some((c) => c.path === path)) {
    return Response.json({ error: 'Not a changed file' }, { status: 404 });
  }
  return Response.json(await gitDiff(status.root, path));
}
