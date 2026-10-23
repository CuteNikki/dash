import 'server-only';

import { runCompose, type Stack } from '@/lib/docker/compose';
import type { RunLine } from '@/lib/docker/runner';
import {
  readHostFile,
  removeHostEntry,
  removeHostFile,
} from '@/lib/host/host-files';
import {
  findCaddy,
  reloadCaddy,
  say,
  shown,
  siteFile,
} from '@/lib/stacks/service-stacks';

/**
 * Removes a service: its stack's containers and networks taken down, its
 * Caddy site, if it has one, removed and Caddy reloaded, and with `files`,
 * its folder and volumes too, its data with them. Says what it's doing as it
 * goes; nothing is undone if a step fails, as nothing can be brought back.
 */
export async function* removeService(
  stack: Stack,
  { files }: { files: boolean }
): AsyncGenerator<RunLine, number> {
  try {
    yield say(`Taking ${stack.project} down`);
    const down = runCompose(stack, [
      'down',
      '--remove-orphans',
      ...(files ? ['--volumes'] : []),
    ]);
    for (;;) {
      const next = await down.next();
      if (next.done) {
        if (next.value !== 0) throw new Error("Compose couldn't take it down");
        break;
      }
      yield next.value;
    }

    // Its site, if it has one, as it now leads nowhere
    const caddy = await findCaddy().catch(() => undefined);
    const site = caddy && siteFile(caddy.sites, stack.project);
    if (caddy && site && (await readHostFile(site)) !== undefined) {
      yield say(`Removing its site, ${shown(site)}`);
      await removeHostFile(site);
      await reloadCaddy(caddy.id);
    }

    if (files) {
      yield say(`Deleting ${shown(stack.dir)}`);
      await removeHostEntry(stack.dir);
    }

    yield say(`Removed ${stack.project}`);
    return 0;
  } catch (error) {
    for (const line of (error as Error).message.split('\n')) {
      yield { stream: 'stderr', line };
    }
    return 1;
  }
}
