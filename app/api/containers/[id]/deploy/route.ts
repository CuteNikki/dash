import { runCompose } from '@/lib/compose';
import { streamRun } from '@/lib/run-stream';
import { unauthorized } from '@/lib/session';
import { stackOf } from '@/lib/stack-files';

/**
 * Redeploys the container's stack (docker compose up -d, with --build for
 * ?build=1), streaming what Compose prints.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/deploy'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const stack = await stackOf((await params).id);
  if (!stack) {
    return Response.json(
      { error: 'This container isn’t part of a compose stack' },
      { status: 404 }
    );
  }
  // ?build=1 builds the stack's images afresh first, for a changed Dockerfile
  const build = new URL(request.url).searchParams.get('build') === '1';
  return streamRun(() =>
    runCompose(stack, ['up', '-d', ...(build ? ['--build'] : [])])
  );
}
