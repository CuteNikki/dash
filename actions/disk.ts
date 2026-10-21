'use server';

import { startDiskScan } from '@/lib/disk-usage';
import { dockerPrune } from '@/lib/docker';
import { requireUser } from '@/lib/session';

/** Measures the server's disk again, in the background. */
export async function measureDisk() {
  await requireUser();
  startDiskScan();
}

/**
 * Frees Docker's build cache no build is using, or its images no container
 * is made from. Gives the bytes freed, or why it couldn't.
 */
export async function pruneDocker(
  what: 'buildCache' | 'images'
): Promise<{ ok: true; freed: number } | { ok: false; error: string }> {
  await requireUser();
  try {
    return { ok: true, freed: await dockerPrune(what) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
