import { denied, serviceForRoute } from '@/lib/auth/access';
import { listContainers } from '@/lib/docker/docker';
import { streamRun } from '@/lib/docker/run-stream';
import { DASH_PROJECT } from '@/lib/site';
import {
  followSelfUpdate,
  selfUpdateToFollow,
} from '@/lib/updates/self-update';

/**
 * The dashboard's own rebuild, followed from its start, as by a window opened
 * after it began, or after the dashboard restarted on the new build, whose
 * container is a new one; for those who may update the dashboard. A 404 when
 * there's been no rebuild lately.
 */
export async function GET() {
  // Who's asking first, which also keeps this from being built as a page
  const refused = await denied('manage');
  if (refused) return refused;
  const dash = (await listContainers()).find(
    (c) => c.stack?.project === DASH_PROJECT && c.state === 'running'
  );
  if (!dash) {
    return Response.json({ error: 'No dashboard found' }, { status: 404 });
  }
  const found = await serviceForRoute(dash.id, 'manage');
  if (found instanceof Response) return found;
  if (!(await selfUpdateToFollow())) {
    return Response.json({ error: 'No rebuild to follow' }, { status: 404 });
  }
  return streamRun(followSelfUpdate, { watching: true });
}
