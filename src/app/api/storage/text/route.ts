import { denied } from '@/lib/auth/access';
import { peekText } from '@/lib/storage';

/**
 * The start of a file in storage as text, to show it by, or that it isn't
 * text, as a TextPeek.
 */
export async function GET(request: Request) {
  const refused = await denied('manage');
  if (refused) return refused;
  const query = new URL(request.url).searchParams;
  const bucket = query.get('bucket');
  const key = query.get('key');
  if (!bucket || !key) {
    return Response.json({ error: 'Which file?' }, { status: 400 });
  }
  try {
    return Response.json(await peekText(bucket, key));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
