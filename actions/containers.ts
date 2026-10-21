'use server';

import {
  containerAction,
  listContainers,
  type ContainerAction,
} from '@/lib/docker';
import { requireUser } from '@/lib/session';

const ACTIONS: ContainerAction[] = ['start', 'stop', 'restart'];

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Starts, stops or restarts one of the server's containers. */
export async function runContainerAction(
  id: string,
  action: ContainerAction
): Promise<ActionResult> {
  await requireUser();
  if (!ACTIONS.includes(action)) return { ok: false, error: 'Unknown action' };
  const containers = await listContainers();
  if (!containers.some((c) => c.id === id)) {
    return { ok: false, error: 'That container no longer exists' };
  }
  try {
    await containerAction(id, action);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
