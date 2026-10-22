import 'server-only';

import type { RunLine } from '@/lib/runner';

/**
 * A run's output as a response: what it prints as one JSON object per line,
 * then { exitCode }. A run that throws ends with its error as a line and
 * exit code 1. Read it with readRunStream.
 */
export function streamRun(run: () => AsyncGenerator<RunLine, number>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
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
