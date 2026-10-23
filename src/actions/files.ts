'use server';

import type { ActivityAction } from '@/lib/activity/actions';
import { record } from '@/lib/activity/record';
import { requireAccess } from '@/lib/auth/access';
import type { Stack } from '@/lib/docker/compose';
import {
  createStackEntry,
  deleteStackEntry,
  renameStackEntry,
  saveStackFile,
  stackOf,
  type FileResult,
} from '@/lib/docker/stack-files';

/**
 * Runs a change on a container's stack, for a signed-in user, its failure as
 * an error to show, and notes it in the activity log, by the file's path in
 * its stack: "papermc/docker-compose.yml".
 */
async function onStack(
  containerId: string,
  note: { action: ActivityAction; path: string; detail?: string },
  change: (stack: Stack) => Promise<FileResult | void>
): Promise<FileResult> {
  const access = await requireAccess('manage');
  const stack = await stackOf(containerId);
  if (!stack) {
    return { ok: false, error: "This container isn't part of a compose stack" };
  }
  let result: FileResult;
  try {
    result = (await change(stack)) ?? { ok: true };
  } catch (error) {
    result = { ok: false, error: (error as Error).message };
  }
  await record(access, {
    action: note.action,
    target: `${stack.project}/${note.path.replace(/^\/+/, '')}`,
    detail: note.detail,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
  });
  return result;
}

/** Saves one of a stack's files, if Compose accepts the stack with it. */
export async function saveFile(
  containerId: string,
  path: string,
  content: string
) {
  return onStack(containerId, { action: 'file.save', path }, (stack) =>
    saveStackFile(stack, path, content)
  );
}

/** Makes an empty file or folder named `name` in `folder`. */
export async function createEntry(
  containerId: string,
  folder: string,
  name: string,
  kind: 'file' | 'dir'
) {
  return onStack(
    containerId,
    { action: 'file.create', path: `${folder}/${name}` },
    (stack) => createStackEntry(stack, folder, name, kind)
  );
}

/** Renames a file or folder, keeping it in the same folder. */
export async function renameEntry(
  containerId: string,
  path: string,
  name: string
) {
  return onStack(
    containerId,
    { action: 'file.rename', path, detail: `to ${name}` },
    (stack) => renameStackEntry(stack, path, name)
  );
}

/** Deletes a file, or a folder and everything in it. */
export async function deleteEntry(containerId: string, path: string) {
  return onStack(containerId, { action: 'file.delete', path }, (stack) =>
    deleteStackEntry(stack, path)
  );
}
