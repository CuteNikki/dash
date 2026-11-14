import 'server-only';

import {
  listContainers,
  removeContainer,
  type Container,
} from '@/lib/docker/docker';
import {
  runContainer,
  runToEnd,
  type Run,
  type RunLine,
} from '@/lib/docker/runner';

/**
 * Docker Compose, run in a short-lived container of the official CLI image,
 * so it works the same wherever the dashboard runs and its own image needs
 * no Compose. It gets the Docker socket, and the folder the stacks live in at
 * the same path, as Compose expects to find their files where they are.
 */
const CLI_IMAGE = 'docker:29.9-cli';

export type Stack = { project: string; dir: string; files: string[] };

export function composeRun(stack: Stack, args: string[]): Run {
  return {
    image: CLI_IMAGE,
    cmd: [
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
    workingDir: stack.dir,
    binds: ['/var/run/docker.sock:/var/run/docker.sock'],
  };
}

/**
 * Compose recreates a container by creating the new one as
 * "<old id's first 12>_<name>", then removing the old one and renaming the
 * new. This is that new one, under that name: for a moment while a recreate
 * is under way, not yet started, or for good if it was cut off.
 */
export function isRecreateCopy(c: Container) {
  return !!c.stack && /^[0-9a-f]{12}_/.test(c.name);
}

/**
 * A recreate cut off between making its new container and renaming it
 * leaves that one behind, never started, and every later recreate fails on
 * its name being taken. These are the stack's such leftovers.
 */
async function leftovers(stack: Stack) {
  return (await listContainers()).filter(
    (c) =>
      c.stack?.project === stack.project &&
      isRecreateCopy(c) &&
      (c.state === 'created' || c.state === 'exited' || c.state === 'dead')
  );
}

/**
 * The `up` each stack has running or waiting last, by project, for the next
 * to wait for. A recreate's new container looks just like a leftover until
 * it's renamed, so clearing leftovers while another `up` in the stack is
 * partway through would remove the container it's about to start, and the
 * service would be left with none at all.
 */
const ups = new Map<string, Promise<void>>();

/**
 * Runs `docker compose <args>` for a stack, yielding what it prints line by
 * line, and returns how it exited. Before an `up`, it clears away what an
 * earlier recreate cut off left behind, which would stop it; one `up` at a
 * time in each stack, so that's never one still under way.
 */
export async function* runCompose(
  stack: Stack,
  args: string[]
): AsyncGenerator<RunLine, number> {
  if (args[0] !== 'up') return yield* runContainer(composeRun(stack, args));

  const before = ups.get(stack.project);
  let release = () => {};
  const done = new Promise<void>((resolve) => (release = resolve));
  const mine = (before ?? Promise.resolve()).then(() => done);
  ups.set(stack.project, mine);
  try {
    if (before) {
      yield {
        stream: 'stdout',
        line: 'Waiting for another recreate in this stack to finish…',
      };
      await before;
    }
    for (const c of await leftovers(stack)) {
      await removeContainer(c.id);
      yield {
        stream: 'stdout',
        line: `Removed ${c.name}, left behind by an earlier recreate that didn't finish`,
      };
    }
    return yield* runContainer(composeRun(stack, args));
  } finally {
    release();
    if (ups.get(stack.project) === mine) ups.delete(stack.project);
  }
}

/** Runs Compose to the end: its whole output, and whether it succeeded. */
export async function composeOutput(stack: Stack, args: string[]) {
  const { ok, lines } = await runToEnd(composeRun(stack, args));
  return { ok, output: lines.map((l) => l.line).join('\n') };
}

/** What Compose makes of a stack's files, the parts the dashboard reads. */
export type ComposeConfig = {
  services: Record<
    string,
    { container_name?: string; networks?: Record<string, unknown> }
  >;
  networks?: Record<string, { name?: string }>;
};

/** A stack's config as Compose resolves it, or its complaint as an error. */
export async function composeConfig(stack: Stack): Promise<ComposeConfig> {
  const { ok, lines } = await runToEnd(
    composeRun(stack, ['config', '--format', 'json'])
  );
  if (!ok) throw new Error(lines.map((l) => l.line).join('\n'));
  // Only what it printed to stdout; warnings go to stderr
  return JSON.parse(
    lines
      .filter((l) => l.stream === 'stdout')
      .map((l) => l.line)
      .join('\n')
  );
}
