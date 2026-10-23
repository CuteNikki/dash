import { z } from 'zod';

import { recordRun } from '@/lib/activity/record';
import { denied, getAccess } from '@/lib/auth/access';
import { restoreBackup } from '@/lib/backups/backups';
import { streamRun } from '@/lib/docker/run-stream';

const Input = z.object({
  source: z.string().min(1).max(300),
  snapshot: z.string().regex(/^[0-9a-f]{8,64}$/),
  /** When the backup was, for the activity log */
  label: z.string().max(300).optional(),
});

/** Puts one part back as one of its backups has it, streaming what it does. */
export async function POST(request: Request) {
  const refused = await denied('server');
  if (refused) return refused;
  const input = Input.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: 'Which backup?' }, { status: 400 });
  }
  const { source, snapshot, label } = input.data;
  return streamRun(() => restoreBackup(source, snapshot), {
    done: recordRun(await getAccess(), {
      action: 'backup.restore',
      target: source,
      detail: label,
    }),
  });
}
