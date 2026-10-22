/** One line of a streamed run: something it printed, or how it ended. */
type RunEvent = { line?: string; exitCode?: number };

/**
 * Reads a run streamed by streamRun, handing each line it prints to `onLine`
 * as it comes, and returns its exit code. A response that's refused, such as
 * a 404, is one line saying why and exit code 1.
 */
export async function readRunStream(
  res: Response,
  onLine: (line: string) => void
) {
  if (!res.ok || !res.body) {
    onLine((await res.json().catch(() => null))?.error ?? res.statusText);
    return 1;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  let exitCode = 1;
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
  return exitCode;
}
