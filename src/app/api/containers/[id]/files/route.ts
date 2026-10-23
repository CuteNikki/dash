import { denied } from '@/lib/auth/access';
import { stackInfo, stackOf } from '@/lib/docker/stack-files';

/** The stack a container belongs to: its folder, compose files, and whether it builds. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/containers/[id]/files'>
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
  return Response.json(await stackInfo(stack));
}
