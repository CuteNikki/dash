'use server';

import { record } from '@/lib/activity/record';
import { requireAccess } from '@/lib/auth/access';
import { dockerPrune } from '@/lib/docker/docker';
import { formatBytes } from '@/lib/format';
import { startDiskScan } from '@/lib/host/disk-usage';

/** Measures the server's disk again, in the background. */
export async function measureDisk() {
  await requireAccess('server');
  startDiskScan();
}

/**
 * Frees Docker's build cache no build is using, or its images no container
 * is made from. Gives the bytes freed, or why it couldn't.
 */
export async function pruneDocker(
  what: 'buildCache' | 'images'
): Promise<{ ok: true; freed: number } | { ok: false; error: string }> {
  const access = await requireAccess('server');
  const target =
    what === 'images' ? "Docker's unused images" : "Docker's build cache";
  try {
    const freed = await dockerPrune(what);
    await record(access, {
      action: 'docker.prune',
      target,
      detail: formatBytes(freed),
    });
    return { ok: true, freed };
  } catch (error) {
    const message = (error as Error).message;
    await record(access, {
      action: 'docker.prune',
      target,
      ok: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}
