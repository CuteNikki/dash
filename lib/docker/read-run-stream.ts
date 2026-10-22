/** One line of a streamed run: something it printed, or how it ended. */
type RunEvent = { line?: string; exitCode?: number };

/**
 * Reads a run streamed by streamRun, handing each line it prints to `onLine`
 * as it comes, and returns its exit code. A response that's refused, such as
 * a 404, is one line saying why and exit code 1. Undefined when the
 * connection ended before it said how the run ended, as when the server
 * restarts Docker partway, which a run on the server can outlast.
 */
export async function readRunStream(
  res: Response,
  onLine: (line: string) => void
): Promise<number | undefined> {
  if (!res.ok || !res.body) {
    onLine((await res.json().catch(() => null))?.error ?? res.statusText);
    return 1;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  let exitCode: number | undefined;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parts = (rest + value).split('\n');
      rest = parts.pop() ?? '';
      for (const part of parts.filter(Boolean)) {
        const event: RunEvent = JSON.parse(part);
        if (event.exitCode !== undefined) exitCode = event.exitCode;
        else if (event.line !== undefined) onLine(event.line);
      }
    }
  } catch {
    // The connection broke: how it ended is left unknown
  }
  return exitCode;
}
