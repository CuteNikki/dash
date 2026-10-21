import 'server-only';

import { dockerRequest, logLines } from '@/lib/docker';

/** The folder the stacks live in, mounted into a run at the same path. */
export const STACKS_ROOT = process.env.STACKS_ROOT ?? '/home/nikki';

export type Run = {
  /** e.g. "docker:29.9-cli", pulled the first time it's needed */
  image: string;
  cmd: string[];
  entrypoint?: string[];
  workingDir: string;
  /** "uid:gid" to run as; the image's own user otherwise */
  user?: string;
  env?: Record<string, string>;
  /** Mounts beyond the stacks' folder */
  binds?: string[];
  /** Sees the server's processes rather than only its own, to look at them */
  hostProcesses?: boolean;
  /**
   * May signal the server's processes, which Docker's own AppArmor profile
   * otherwise keeps a container to its own
   */
  signalsHost?: boolean;
};

export type RunLine = { stream: 'stdout' | 'stderr'; line: string };

async function json<T>(method: string, path: string, body?: unknown) {
  const res = await dockerRequest(method, path, body);
  let text = '';
  for await (const chunk of res) text += chunk;
  return (text ? JSON.parse(text) : undefined) as T;
}

async function create(run: Run) {
  const body = {
    Image: run.image,
    Cmd: run.cmd,
    Entrypoint: run.entrypoint,
    WorkingDir: run.workingDir,
    User: run.user,
    Env: Object.entries(run.env ?? {}).map(([k, v]) => `${k}=${v}`),
    Labels: { 'dash.purpose': 'a short-lived run for the dashboard' },
    HostConfig: {
      Binds: [`${STACKS_ROOT}:${STACKS_ROOT}`, ...(run.binds ?? [])],
      // By Docker once it exits, so none is left behind even when the
      // dashboard stops partway through a run
      AutoRemove: true,
      PidMode: run.hostProcesses ? 'host' : undefined,
      SecurityOpt: run.signalsHost ? ['apparmor=unconfined'] : undefined,
    },
  };
  try {
    return await json<{ Id: string }>('POST', '/containers/create', body);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
    // The image isn't on the server yet: pull it, then try again
    const [name, tag] = run.image.split(':');
    await json('POST', `/images/create?fromImage=${name}&tag=${tag}`);
    return await json<{ Id: string }>('POST', '/containers/create', body);
  }
}

/**
 * Runs a command in a short-lived container, yielding what it prints line by
 * line, and returns how it exited. The container is removed afterwards.
 */
export async function* runContainer(run: Run): AsyncGenerator<RunLine, number> {
  const { Id } = await create(run);
  try {
    // Both before it starts, as it may be done and gone before either could
    // be asked for afterwards: what it prints, and how it exits
    const output = await dockerRequest(
      'POST',
      `/containers/${Id}/attach?stream=1&stdout=1&stderr=1`
    );
    const removed = await dockerRequest(
      'POST',
      `/containers/${Id}/wait?condition=removed`
    );
    await dockerRequest('POST', `/containers/${Id}/start`).then((r) =>
      r.resume()
    );
    yield* logLines(output, false);
    let text = '';
    for await (const chunk of removed) text += chunk;
    return (JSON.parse(text) as { StatusCode: number }).StatusCode;
  } finally {
    // Only left when the run was given up on before it finished
    await dockerRequest('DELETE', `/containers/${Id}?force=1`)
      .then((r) => r.resume())
      .catch(() => undefined);
  }
}

/** Runs to the end: its whole output, line by line, and how it exited. */
export async function runToEnd(run: Run) {
  const lines: RunLine[] = [];
  const it = runContainer(run);
  for (;;) {
    const next = await it.next();
    if (next.done) return { ok: next.value === 0, exitCode: next.value, lines };
    lines.push(next.value);
  }
}
