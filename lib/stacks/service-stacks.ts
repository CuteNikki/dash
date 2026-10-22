import 'server-only';

import { posix } from 'node:path';

import { isRunning } from '@/lib/dashboard/status';
import type { Stack } from '@/lib/docker/compose';
import { execRun, listContainers, type Container } from '@/lib/docker/docker';
import { STACKS_ROOT, type RunLine } from '@/lib/docker/runner';
import { hostOwner } from '@/lib/host/host-files';
import { isCaddy, RELOAD_CADDY, reloadError } from '@/lib/stacks/caddy';

/**
 * The services dash adds and removes: each a stack in a folder of its own in
 * ~/services, named as its compose project, with its domain, if it has one,
 * in Caddy's sites/<name>.caddy.
 */
export const SERVICES_DIR = posix.join(STACKS_ROOT, 'services');

/** Stacks never removed from here: dash's own, mid-request, and Caddy's, every site's. */
const KEPT = ['dash'];

export const say = (line: string): RunLine => ({ stream: 'stdout', line });

/** A path as it reads on the server, the home folder as ~. */
export const shown = (path: string) => path.replace(STACKS_ROOT, '~');

/** Caddy's container, and the folder its site files are imported from. */
export async function findCaddy() {
  const caddy = (await listContainers()).find(
    (c) => isCaddy(c.image) && c.stack
  );
  if (!caddy || !isRunning(caddy.state)) {
    throw new Error("Caddy isn't running");
  }
  const sites = posix.join(caddy.stack!.dir, 'sites');
  await hostOwner(sites).catch(() => {
    throw new Error(`Caddy has no ${shown(sites)} folder of site files`);
  });
  return { id: caddy.id, sites };
}

/** Where a service's site file is, or would be. */
export const siteFile = (sites: string, name: string) =>
  posix.join(sites, `${name}.caddy`);

/** Has Caddy read its config again; Caddy keeps the old one if it's wrong. */
export async function reloadCaddy(id: string) {
  const { stderr, exitCode } = await execRun(id, RELOAD_CADDY);
  if (exitCode !== 0) throw new Error(reloadError(stderr));
}

/**
 * Whether a stack can be removed from here: one of ~/services' own folders,
 * not dash's or Caddy's, given every container there is.
 */
export function removable(stack: Stack, containers: Container[]) {
  if (posix.dirname(stack.dir) !== SERVICES_DIR) return false;
  if (KEPT.includes(stack.project)) return false;
  return !containers.some(
    (c) => c.stack?.project === stack.project && isCaddy(c.image)
  );
}
