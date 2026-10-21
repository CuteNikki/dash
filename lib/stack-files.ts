import 'server-only';

import { posix } from 'node:path';

import { composeOutput, type Stack } from '@/lib/compose';
import { listContainers } from '@/lib/docker';
import { readHostFile, removeHostFile, writeHostFile } from '@/lib/host-files';

export type StackFile = {
  path: string;
  name: string;
  kind: 'compose' | 'env';
  /** Undefined for a .env that isn't there yet */
  content?: string;
};

/** The compose stack a container belongs to, as Docker's labels record it. */
export async function stackOf(containerId: string): Promise<Stack | undefined> {
  const container = (await listContainers()).find((c) => c.id === containerId);
  const s = container?.stack;
  if (!s?.dir || !s.files.length) return undefined;
  return { project: s.project, dir: s.dir, files: s.files };
}

/**
 * The files of a stack that can be edited here: its compose files, and the
 * .env beside them that Compose reads its variables from. Nothing else, so
 * the dashboard can't be used to edit any file on the server.
 */
function editablePaths(stack: Stack) {
  return [
    ...stack.files.map((path) => ({ path, kind: 'compose' as const })),
    { path: posix.join(stack.dir, '.env'), kind: 'env' as const },
  ];
}

export async function readStackFiles(stack: Stack): Promise<StackFile[]> {
  return Promise.all(
    editablePaths(stack).map(async ({ path, kind }) => ({
      path,
      name: posix.basename(path),
      kind,
      content: await readHostFile(path),
    }))
  );
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Saves a stack file once Compose accepts it: the new text goes in a file
 * beside the real one first, `docker compose config` reads the stack with it
 * in that one's place, and only then is the real file replaced.
 */
export async function saveStackFile(
  stack: Stack,
  path: string,
  content: string
): Promise<SaveResult> {
  const file = editablePaths(stack).find((f) => f.path === path);
  if (!file) return { ok: false, error: "That file isn't part of this stack" };

  const candidate = posix.join(
    posix.dirname(path),
    `.dash-check-${posix.basename(path)}`
  );
  await writeHostFile(candidate, content);
  try {
    const args =
      file.kind === 'env'
        ? ['--env-file', candidate, 'config', '-q']
        : ['config', '-q'];
    const checked =
      file.kind === 'env'
        ? stack
        : {
            ...stack,
            files: stack.files.map((f) => (f === path ? candidate : f)),
          };
    const { ok, output } = await composeOutput(checked, args);
    if (!ok) {
      // Compose names the file it read; show the real one's name
      return { ok: false, error: output.replaceAll(candidate, path) };
    }
  } finally {
    await removeHostFile(candidate);
  }
  await writeHostFile(path, content);
  return { ok: true };
}
