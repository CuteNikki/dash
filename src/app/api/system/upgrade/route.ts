import { unauthorized } from '@/lib/auth/session';
import { streamRun } from '@/lib/docker/run-stream';
import { followUpgrade, startUpgrade } from '@/lib/host/system-updates';

/** Starts upgrading the server's packages, streaming what apt prints until it's done. */
export async function POST() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    await startUpgrade();
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  // Only following it: the upgrade itself carries on under systemd
  return streamRun(followUpgrade, { watching: true });
}

/** The running or last upgrade's output, from its start, as after losing the connection to it. */
export async function GET() {
  return (await unauthorized()) ?? streamRun(followUpgrade, { watching: true });
}
