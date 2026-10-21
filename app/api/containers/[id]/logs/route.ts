import { containerLogs, DockerError, logLines } from '@/lib/docker';
import { unauthorized } from '@/lib/session';

/** How many earlier lines come first, before following new ones. */
const TAIL = 500;

/**
 * A container's log as it's written, one JSON object per line:
 * { stream: "stdout" | "stderr", line: "<RFC 3339 time> <text>" }.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/logs'>
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await params;
  try {
    const { res, tty } = await containerLogs(id, {
      tail: TAIL,
      signal: request.signal,
    });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const entry of logLines(res, tty)) {
            controller.enqueue(encoder.encode(JSON.stringify(entry) + '\n'));
          }
        } catch {
          // The viewer went away, or the container stopped
        }
        controller.close();
      },
      cancel() {
        res.destroy();
      },
    });
    return new Response(body, {
      headers: {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const status = error instanceof DockerError ? error.status : 500;
    return Response.json({ error: (error as Error).message }, { status });
  }
}
