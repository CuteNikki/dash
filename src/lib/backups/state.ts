import 'server-only';

import {
  backupConfig,
  backupRunning,
  lastRun,
  listSources,
  nightlyAt,
  readSnapshots,
} from '@/lib/backups/backups';
import type { BackupSnapshots, BackupState } from '@/lib/types';

/**
 * What the Backups window shows at once: whether they're on, each part, the
 * last run. The backups themselves come apart, as reading them takes restic.
 */
export async function backupState(): Promise<BackupState> {
  const config = backupConfig();
  const [sources, last] = await Promise.all([listSources(), lastRun()]);
  return {
    off: 'off' in config ? config.off : undefined,
    where: 'off' in config ? undefined : config.local ? 'local' : 'elsewhere',
    nightlyAt: nightlyAt(),
    running: backupRunning(),
    lastRun: last ?? undefined,
    sources: sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      enabled: s.enabled,
      added: s.kind === 'folder' && s.added,
    })),
  };
}

/** The longest the window waits for the backups, so it never waits for ever. */
const WAIT_MS = 45_000;

/** Every backup there is, and what they take up, or why they couldn't be read. */
export async function backupSnapshots(): Promise<BackupSnapshots> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readSnapshots(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('No answer from restic in 45 seconds')),
          WAIT_MS
        );
      }),
    ]);
  } catch (error) {
    return { snapshots: [], error: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
