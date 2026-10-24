import { z } from 'zod';

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

const Input = z
  .object({
    /** One part, rather than everything */
    source: z.string().min(1).max(300).optional(),
  })
  .nullable();

/** Backs everything up now, or one part, streaming what restic says. */
export async function POST(request: Request) {
  const refused = await denied('server');
  if (refused) return refused;
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: 'Back up what?' }, { status: 400 });
  }
  const source = input.data?.source;
  const access = await getAccess();
  return streamRun(() => runBackups(access?.user.name ?? 'Someone', source), {
    done: recordRun(access, {
      action: 'backup.run',
      target: source ?? 'everything',
    }),
  });
}
