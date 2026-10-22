import { linuxServerTemplates } from '@/lib/linuxserver';
import { CURATED } from '@/lib/service-templates';
import { unauthorized } from '@/lib/session';

/**
 * Every template: the big apps LinuxServer.io doesn't package, then its own,
 * most pulled first. If its catalogue can't be fetched, just the first.
 */
export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const fetched = await linuxServerTemplates().catch(() => []);
  const curated = new Set(CURATED.map((t) => t.id));
  return Response.json([
    ...CURATED,
    ...fetched.filter((t) => !curated.has(t.id)),
  ]);
}
