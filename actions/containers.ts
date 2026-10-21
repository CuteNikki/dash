'use server';

import { isCaddy, RELOAD_CADDY, reloadError } from '@/lib/caddy';
import {
  containerAction,
  execRun,
  listContainers,
  sendInput,
  takesInput,
  type ContainerAction,
} from '@/lib/docker';
import { requireUser } from '@/lib/session';
import { isRunning } from '@/lib/status';

/** Longer than any command a console takes, to keep a paste from flooding one. */
const MAX_COMMAND = 1_000;

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

/**
 * Types one command into a container's console, as pressing Enter there
 * would; its reply shows in the log.
 */
export async function sendToConsole(
  id: string,
  command: string
): Promise<ActionResult> {
  await requireUser();
  if (/[\r\n]/.test(command)) {
    return { ok: false, error: 'One command at a time, on one line' };
  }
  if (command.length > MAX_COMMAND) {
    return { ok: false, error: 'That command is too long' };
  }
  const container = (await listContainers()).find((c) => c.id === id);
  if (!container) {
    return { ok: false, error: 'That container no longer exists' };
  }
  if (!(await takesInput(id))) {
    return { ok: false, error: 'Its console takes no input' };
  }
  if (!isRunning(container.state)) {
    return { ok: false, error: "It isn't running" };
  }
  try {
    await sendInput(id, `${command}\n`);
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
