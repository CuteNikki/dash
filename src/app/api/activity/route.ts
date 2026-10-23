import { readActivity } from '@/lib/activity/read';
import { denied } from '@/lib/auth/access';

/**
 * The activity log, a page at a time: ?before=<ms> for the page after one,
 * ?q= for only what mentions something. For those who see the whole server.
 */
export async function GET(request: Request) {
  const refused = await denied('server');
  if (refused) return refused;
  const params = new URL(request.url).searchParams;
  const before = Number(params.get('before')) || undefined;
  return Response.json(
    await readActivity({ before, search: params.get('q') ?? undefined })
  );
}
