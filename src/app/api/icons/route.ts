import { denied } from '@/lib/auth/access';
import { searchIcons } from '@/lib/icons/icon-search';

/** Matches sent for one search; typing more narrows them down. */
const LIMIT = 48 * 4;

/** Icons from every set matching ?q=, best first. */
export async function GET(request: Request) {
  const refused = await denied('manage');
  if (refused) return refused;
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return Response.json(await searchIcons(query, LIMIT));
}
