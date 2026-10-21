'use server';

import { isCaddy, RELOAD_CADDY, reloadError } from '@/lib/caddy';
import {
  containerAction,
  execRun,
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

/** Has a running Caddy read its Caddyfile again, keeping the old config if the new one's wrong. */
export async function reloadCaddyConfig(id: string): Promise<ActionResult> {
  await requireUser();
  const containers = await listContainers();
  const caddy = containers.find((c) => c.id === id);
  if (!caddy || !isCaddy(caddy.image)) {
    return { ok: false, error: 'That container is not Caddy' };
  }
  try {
    const { stderr, exitCode } = await execRun(id, RELOAD_CADDY);
    return exitCode === 0
      ? { ok: true }
      : { ok: false, error: reloadError(stderr) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
