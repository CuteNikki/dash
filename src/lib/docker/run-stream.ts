import 'server-only';

import type { RunLine } from '@/lib/docker/runner';

/**
 * A run's output as a response: what it prints as one JSON object per line,
 * then { exitCode }. A run that throws ends with its error as a line and
 * exit code 1. Read it with readRunStream. The run goes on to its end even
 * if whoever asked goes away, as one stopped partway can leave a stack half
 * changed, with nothing put back; unless it's `watching`, only following
 * something that carries on without it, which stops once nobody is. Once
 * it's done, `done` is told how it exited and the last error it printed,
 * for the activity log.
 */
export function streamRun(
  run: () => AsyncGenerator<RunLine, number>,
  {
    watching = false,
    done,
  }: {
    watching?: boolean;
    done?: (exitCode: number, lastError?: string) => Promise<void>;
  } = {}
) {
  const encoder = new TextEncoder();
  // Once the response is closed by the other end, after which there's
  // nobody to send to
  let gone = false;
  let lines: AsyncGenerator<RunLine, number> | undefined;
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
      let exitCode = 1;
      let lastError: string | undefined;
      try {
        lines = run();
        for (;;) {
          const next = await lines.next();
          if (next.done) {
            exitCode = next.value;
            send({ exitCode });
            break;
          }
          if (next.value.stream === 'stderr') lastError = next.value.line;
          send(next.value);
        }
      } catch (error) {
        lastError = (error as Error).message;
        send({ stream: 'stderr', line: lastError });
        send({ exitCode: 1 });
      }
      await done?.(exitCode, lastError);
      try {
        controller.close();
      } catch {
        // Already closed, by the other end going away
      }
    },
    cancel() {
      gone = true;
      // At its next line, as it may be waiting for one
      if (watching) void lines?.return(0).catch(() => {});
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
    },
  });
}
