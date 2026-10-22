import { unauthorized } from '@/lib/auth/session';
import { scheduleReboot } from '@/lib/host/system-updates';

/** Restarts the server, in a few seconds, so this answer gets out first. */
export async function POST() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    await scheduleReboot();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
