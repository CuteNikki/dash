import { record } from '@/lib/activity/record';
import { denied, getAccess } from '@/lib/auth/access';
import { streamRun } from '@/lib/docker/run-stream';
import { followUpgrade, startUpgrade } from '@/lib/host/system-updates';

/** Starts upgrading the server's packages, streaming what apt prints until it's done. */
export async function POST() {
  const refused = await denied('server');
  if (refused) return refused;
  try {
    await startUpgrade();
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  // As it starts: it carries on under systemd, whether or not it's followed
  await record(await getAccess(), { action: 'system.upgrade' });
  // Only following it: the upgrade itself carries on under systemd
  return streamRun(followUpgrade, { watching: true });
}

/** The running or last upgrade's output, from its start, as after losing the connection to it. */
export async function GET() {
  return (
    (await denied('server')) ?? streamRun(followUpgrade, { watching: true })
  );
}
