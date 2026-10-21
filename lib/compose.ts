import 'server-only';

import { runContainer, runToEnd, type Run, type RunLine } from '@/lib/runner';

/**
 * Docker Compose, run in a short-lived container of the official CLI image,
 * so it works the same wherever the dashboard runs and its own image needs
 * no Compose. It gets the Docker socket, and the folder the stacks live in at
 * the same path, as Compose expects to find their files where they are.
 */
const CLI_IMAGE = 'docker:29.9-cli';

export type Stack = { project: string; dir: string; files: string[] };

function composeRun(stack: Stack, args: string[]): Run {
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

export type ComposeLine = RunLine;

/**
 * Runs `docker compose <args>` for a stack, yielding what it prints line by
 * line, and returns how it exited.
 */
export function runCompose(stack: Stack, args: string[]) {
  return runContainer(composeRun(stack, args));
}

/** Runs Compose to the end: its whole output, and whether it succeeded. */
export async function composeOutput(stack: Stack, args: string[]) {
  const { ok, lines } = await runToEnd(composeRun(stack, args));
  return { ok, output: lines.map((l) => l.line).join('\n') };
}
