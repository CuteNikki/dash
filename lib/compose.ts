import 'server-only';

import { dockerRequest, logLines } from '@/lib/docker';

/**
 * Docker Compose, run in a short-lived container of the official CLI image,
 * so it works the same wherever the dashboard runs and its own image needs
 * no Compose. It gets the Docker socket, and the folder the stacks live in at
 * the same path, as Compose expects to find their files where they are.
 */
const CLI_IMAGE = 'docker:29.9-cli';
const [CLI_NAME, CLI_TAG] = CLI_IMAGE.split(':');
const STACKS_ROOT = process.env.STACKS_ROOT ?? '/home/nikki';

export type Stack = { project: string; dir: string; files: string[] };

async function json<T>(method: string, path: string, body?: unknown) {
  const res = await dockerRequest(method, path, body);
  let text = '';
  for await (const chunk of res) text += chunk;
  return (text ? JSON.parse(text) : undefined) as T;
}

async function createRunner(stack: Stack, args: string[]) {
  const body = {
    Image: CLI_IMAGE,
    Cmd: [
      'docker',
      'compose',
      '--ansi',
      'never',
      '--progress',
      'plain',
      '-p',
      stack.project,
      ...stack.files.flatMap((f) => ['-f', f]),
      ...args,
    ],
    WorkingDir: stack.dir,
    Labels: { 'dash.purpose': 'runs docker compose for the dashboard' },
    HostConfig: {
      Binds: [
        '/var/run/docker.sock:/var/run/docker.sock',
        `${STACKS_ROOT}:${STACKS_ROOT}`,
      ],
    },
  };
  try {
    return await json<{ Id: string }>('POST', '/containers/create', body);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    // The CLI image isn't on the server yet: pull it, then try again
    await json('POST', `/images/create?fromImage=${CLI_NAME}&tag=${CLI_TAG}`);
    return await json<{ Id: string }>('POST', '/containers/create', body);
  }
}

export type ComposeLine = { stream: 'stdout' | 'stderr'; line: string };

/**
 * Runs `docker compose <args>` for a stack, yielding what it prints line by
 * line, and returns how it exited.
 */
export async function* runCompose(
  stack: Stack,
  args: string[]
): AsyncGenerator<ComposeLine, number> {
  const { Id } = await createRunner(stack, args);
  try {
    await dockerRequest('POST', `/containers/${Id}/start`).then((r) =>
      r.resume()
    );
    const logs = await dockerRequest(
      'GET',
      `/containers/${Id}/logs?stdout=1&stderr=1&follow=1`
    );
    yield* logLines(logs, false);
    const { StatusCode } = await json<{ StatusCode: number }>(
      'POST',
      `/containers/${Id}/wait`
    );
    return StatusCode;
  } finally {
    await dockerRequest('DELETE', `/containers/${Id}?force=1`)
      .then((r) => r.resume())
      .catch(() => undefined);
  }
}

/** Runs Compose to the end: its whole output, and whether it succeeded. */
export async function composeOutput(stack: Stack, args: string[]) {
  const lines: string[] = [];
  const run = runCompose(stack, args);
  for (;;) {
    const next = await run.next();
    if (next.done) return { ok: next.value === 0, output: lines.join('\n') };
    lines.push(next.value.line);
  }
}
