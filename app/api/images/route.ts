import { unauthorized } from '@/lib/auth/session';
import { searchImages } from '@/lib/templates/image-search';

/** Images found, a few being enough beside the templates. */
const LIMIT = 6;

/** Images on Docker Hub matching ?q=, best first. */
export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return Response.json([]);
  try {
    return Response.json(await searchImages(query, LIMIT));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
