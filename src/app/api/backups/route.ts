import { recordRun } from '@/lib/activity/record';
import { denied, getAccess } from '@/lib/auth/access';
import { runBackups } from '@/lib/backups/backups';
import { backupState } from '@/lib/backups/state';
import { streamRun } from '@/lib/docker/run-stream';

/** The backups: whether they're on, each part and its backups, the last run. */
export async function GET() {
  const refused = await denied('server');
  if (refused) return refused;
  try {
    return Response.json(await backupState());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Backs everything up now, streaming what restic says. */
export async function POST() {
  const refused = await denied('server');
  if (refused) return refused;
  const access = await getAccess();
  return streamRun(() => runBackups(access?.user.name ?? 'Someone'), {
    done: recordRun(access, { action: 'backup.run', target: 'everything' }),
  });
}
