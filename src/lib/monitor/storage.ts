import 'server-only';

import { serviceKey } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import type { Container } from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';
import { containerStorage } from '@/lib/host/service-storage';

/** How long services' daily storage is kept: a year, to see slow growth */
export const KEEP_STORAGE_DAYS = 365;

/**
 * The hour, UTC, from which each day's storage is measured: clear of the
 * night's backups and the host's own snapshots, which slow the disk.
 */
const STORAGE_HOUR = 12;

const DAY_MS = 24 * 60 * 60_000;

/** The day a moment's in, at midnight UTC. */
const dayOf = (ms: number) => new Date(Math.floor(ms / DAY_MS) * DAY_MS);

// The last day measured, so each minute needn't ask the database
const state = ((
  globalThis as typeof globalThis & { storageDay?: { day?: number } }
).storageDay ??= {});

/**
 * Each service's storage, once a day, from STORAGE_HOUR: stopped ones too,
 * as what they keep stays. Measured one after another, as it reads the disk.
 */
export async function maybeRecordStorage(containers: Container[]) {
  const now = new Date();
  if (now.getUTCHours() < STORAGE_HOUR) return;
  const day = dayOf(now.getTime());
  if (state.day === day.getTime()) return;
  state.day = day.getTime();
  // A restart later in the day finds it done already
  if (
    await db.storageSample.findFirst({ where: { day }, select: { day: true } })
  )
    return;
  const seen = new Set<string>();
  for (const c of containers) {
    const key = serviceKey(c);
    // A service run as more than one container has its first's
    if (c.labels[RUN_LABEL] || seen.has(key) || !c.mounts.length) continue;
    seen.add(key);
    try {
      const { total } = await containerStorage(c);
      await db.storageSample.upsert({
        where: { key_day: { key, day } },
        create: { key, day, bytes: total },
        update: { bytes: total },
      });
    } catch (error) {
      console.error(`Storage of ${key}:`, error);
    }
  }
}

/** Clears out what's older than it's kept for. */
export function pruneStorage() {
  return db.storageSample.deleteMany({
    where: { day: { lt: new Date(Date.now() - KEEP_STORAGE_DAYS * DAY_MS) } },
  });
}
