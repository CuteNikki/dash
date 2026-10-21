import { runCompose } from '@/lib/compose';
import { unauthorized } from '@/lib/session';
import { stackOf } from '@/lib/stack-files';

/**
 * Redeploys the container's stack (docker compose up -d), streaming what
 * Compose prints as one JSON object per line, then { exitCode }.
 */
export async function POST(
  _request: Request,
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
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      try {
        const run = runCompose(stack, ['up', '-d']);
        for (;;) {
          const next = await run.next();
          if (next.done) {
            send({ exitCode: next.value });
            break;
          }
          send(next.value);
        }
      } catch (error) {
        send({ stream: 'stderr', line: (error as Error).message });
        send({ exitCode: 1 });
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
    },
  });
}
