'use server';

import type { Stack } from '@/lib/compose';
import { requireUser } from '@/lib/session';
import {
  createStackEntry,
  deleteStackEntry,
  renameStackEntry,
  saveStackFile,
  stackOf,
  type FileResult,
} from '@/lib/stack-files';

/** Runs a change on a container's stack, for a signed-in user, its failure as an error to show. */
async function onStack(
  containerId: string,
  change: (stack: Stack) => Promise<FileResult | void>
): Promise<FileResult> {
  await requireUser();
  const stack = await stackOf(containerId);
  if (!stack) {
    return { ok: false, error: 'This container isn’t part of a compose stack' };
  }
  try {
    return (await change(stack)) ?? { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Saves one of a stack's files, if Compose accepts the stack with it. */
export async function saveFile(
  containerId: string,
  path: string,
  content: string
) {
  return onStack(containerId, (stack) => saveStackFile(stack, path, content));
}

/** Makes an empty file or folder named `name` in `folder`. */
export async function createEntry(
  containerId: string,
  folder: string,
  name: string,
  kind: 'file' | 'dir'
) {
  return onStack(containerId, (stack) =>
    createStackEntry(stack, folder, name, kind)
  );
}

/** Renames a file or folder, keeping it in the same folder. */
export async function renameEntry(
  containerId: string,
  path: string,
  name: string
) {
  return onStack(containerId, (stack) => renameStackEntry(stack, path, name));
}

/** Deletes a file, or a folder and everything in it. */
export async function deleteEntry(containerId: string, path: string) {
  return onStack(containerId, (stack) => deleteStackEntry(stack, path));
}
