'use server';

import { requireAccess } from '@/lib/auth/access';
import { stopProcess as stop } from '@/lib/host/processes';
import type { StopResult } from '@/lib/types';

/**
 * Stops one of the server's processes: asks it to, or, forced, makes it.
 * `start` is when it started, as looked at, so a process that has since
 * ended and had its id given to another is left alone.
 */
export async function stopProcess(
  pid: number,
  start: number,
  force: boolean
): Promise<StopResult> {
  await requireAccess('server');
  // A server action takes whatever it's sent, so only a process id gets through
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, outcome: 'failed', error: 'Not a process id' };
  }
  try {
    return await stop(pid, start, force);
  } catch (error) {
    return { ok: false, outcome: 'failed', error: (error as Error).message };
  }
}
