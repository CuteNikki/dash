'use server';

import { requireAccess } from '@/lib/auth/access';
import { dockerPrune } from '@/lib/docker/docker';
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
  await requireAccess('server');
  try {
    return { ok: true, freed: await dockerPrune(what) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
