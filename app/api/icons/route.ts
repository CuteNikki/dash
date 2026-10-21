import { searchIcons } from '@/lib/icon-search';
import { unauthorized } from '@/lib/session';

/** Matches sent for one search; typing more narrows them down. */
const LIMIT = 48 * 4;

/** Icons from every set matching ?q=, best first. */
export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return Response.json(await searchIcons(query, LIMIT));
}
