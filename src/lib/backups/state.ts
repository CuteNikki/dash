import 'server-only';

import {
  backupConfig,
  backupRunning,
  lastRun,
  listSources,
  nightlyAt,
  readSnapshots,
} from '@/lib/backups/backups';
import type { BackupState } from '@/lib/types';

/** Everything the Backups window shows: whether they're on, each part and its backups, the last run. */
export async function backupState(): Promise<BackupState> {
  const config = backupConfig();
  const [sources, last] = await Promise.all([listSources(), lastRun()]);
  let snapshots: Awaited<ReturnType<typeof readSnapshots>> = { snapshots: [] };
  let error: string | undefined;
  if (!('off' in config)) {
    snapshots = await readSnapshots().catch((e: Error) => {
      error = e.message;
      return { snapshots: [] };
    });
  }
  return {
    off: 'off' in config ? config.off : undefined,
    error,
    where: 'off' in config ? undefined : config.local ? 'local' : 'elsewhere',
    nightlyAt: nightlyAt(),
    running: backupRunning(),
    size: snapshots.size,
    lastRun: last ?? undefined,
    sources: sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      enabled: s.enabled,
      added: s.kind === 'folder' && s.added,
      snapshots: snapshots.snapshots
        .filter((x) => x.source === s.id)
        .map(({ id, at, beforeRestore }) => ({ id, at, beforeRestore })),
    })),
  };
}
