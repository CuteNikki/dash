'use server';

import { requireUser } from '@/lib/session';
import { saveStackFile, stackOf, type SaveResult } from '@/lib/stack-files';

/** Saves one of a stack's files, if Compose accepts the stack with it. */
export async function saveFile(
  containerId: string,
  path: string,
  content: string
): Promise<SaveResult> {
  await requireUser();
  const stack = await stackOf(containerId);
  if (!stack) {
    return { ok: false, error: 'This container isn’t part of a compose stack' };
  }
  try {
    return await saveStackFile(stack, path, content);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
