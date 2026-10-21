import { unauthorized } from '@/lib/session';
import { openStackFile, stackOf } from '@/lib/stack-files';

/** A file of the stack, ?path= relative to its folder, if it can be edited here. */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/files/content'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const stack = await stackOf((await params).id);
  if (!stack) return Response.json({ error: 'No stack' }, { status: 404 });
  const path = new URL(request.url).searchParams.get('path') ?? '';
  try {
    return Response.json(await openStackFile(stack, path));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
