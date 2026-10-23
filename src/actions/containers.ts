'use server';

import { outcome, record, tried } from '@/lib/activity/record';
import { requireAccess, serviceForAction } from '@/lib/auth/access';
import { isRunning } from '@/lib/dashboard/status';
import {
  containerAction,
  execRun,
  listContainers,
  sendInput,
  takesInput,
  type ContainerAction,
} from '@/lib/docker/docker';
import { isCaddy, RELOAD_CADDY, reloadError } from '@/lib/stacks/caddy';
import type { ServiceUpdate } from '@/lib/types';
import { checkUpdateNow, checkUpdatesNow } from '@/lib/updates/check';

/** Longer than any command a console takes, to keep a paste from flooding one. */
const MAX_COMMAND = 1_000;

const ACTIONS: ContainerAction[] = ['start', 'stop', 'restart'];

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Starts, stops or restarts one of the server's containers. */
export async function runContainerAction(
  id: string,
  action: ContainerAction
): Promise<ActionResult> {
  if (!ACTIONS.includes(action)) return { ok: false, error: 'Unknown action' };
  const found = await serviceForAction(id, 'control');
  if ('refused' in found) return { ok: false, error: found.refused };
  const result = await tried(() => containerAction(id, action));
  await record(found.access, {
    action,
    target: found.container.name,
    ...outcome(result),
  });
  return result;
}

/**
 * Types one command into a container's console, as pressing Enter there
 * would; its reply shows in the log.
 */
export async function sendToConsole(
  id: string,
  command: string
): Promise<ActionResult> {
  // A console can be a shell, or one that runs the server's own commands
  const found = await serviceForAction(id, 'manage');
  if ('refused' in found) return { ok: false, error: found.refused };
  const { container } = found;
  if (/[\r\n]/.test(command)) {
    return { ok: false, error: 'One command at a time, on one line' };
  }
  if (command.length > MAX_COMMAND) {
    return { ok: false, error: 'That command is too long' };
  }
  if (!(await takesInput(id))) {
    return { ok: false, error: 'Its console takes no input' };
  }
  if (!isRunning(container.state)) {
    return { ok: false, error: "It isn't running" };
  }
  const result = await tried(() => sendInput(id, `${command}\n`));
  await record(found.access, {
    action: 'console',
    target: container.name,
    detail: command,
    ...outcome(result),
  });
  return result;
}

/** Has a running Caddy read its Caddyfile again, keeping the old config if the new one's wrong. */
export async function reloadCaddyConfig(id: string): Promise<ActionResult> {
  // Caddy serves every site, so it's the whole server's, not one group's
  const found = await serviceForAction(id, 'manage');
  if ('refused' in found) return { ok: false, error: found.refused };
  const caddy = found.container;
  if (!isCaddy(caddy.image)) {
    return { ok: false, error: 'That container is not Caddy' };
  }
  const result = await tried(async () => {
    const { stderr, exitCode } = await execRun(id, RELOAD_CADDY);
    if (exitCode !== 0) throw new Error(reloadError(stderr));
  });
  await record(found.access, {
    action: 'caddy.reload',
    target: caddy.name,
    ...outcome(result),
  });
  return result;
}

/** Looks for updates everywhere now, rather than when they're next due. */
/** Looks for one service's update now, and what it found: none, when it's up to date. */
export async function checkUpdate(
  id: string
): Promise<
  { ok: true; update?: ServiceUpdate } | { ok: false; error: string }
> {
  const found = await serviceForAction(id, 'control');
  if ('refused' in found) return { ok: false, error: found.refused };
  try {
    const { update, error } = await checkUpdateNow(
      await listContainers(),
      found.container
    );
    return error ? { ok: false, error } : { ok: true, update };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function checkUpdates(): Promise<ActionResult> {
  await requireAccess('control');
  try {
    await checkUpdatesNow(await listContainers());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
