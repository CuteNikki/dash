import 'server-only';

import type { RunLine } from '@/lib/docker/runner';

/**
 * A run's output as a response: what it prints as one JSON object per line,
 * then { exitCode }. A run that throws ends with its error as a line and
 * exit code 1. Read it with readRunStream. The run goes on to its end even
 * if whoever asked goes away, as one stopped partway can leave a stack half
 * changed, with nothing put back.
 */
export function streamRun(run: () => AsyncGenerator<RunLine, number>) {
  const encoder = new TextEncoder();
  // Once the response is closed by the other end, after which there's
  // nobody to send to
  let gone = false;
  const body = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => {
        if (gone) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
        } catch {
          gone = true;
        }
      };
      try {
        const lines = run();
        for (;;) {
          const next = await lines.next();
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
      try {
        controller.close();
      } catch {
        // Already closed, by the other end going away
      }
    },
    cancel() {
      gone = true;
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
    },
  });
}
