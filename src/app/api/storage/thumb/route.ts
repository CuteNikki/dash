import sharp from 'sharp';

import { denied } from '@/lib/auth/access';
import { readFile } from '@/lib/storage';

/** The thumbnails' size, square, for tiles some 150px across on a screen of twice the pixels. */
const SIZE = 320;
/** Pictures bigger than this aren't made smaller, but shown as they are. */
const MAX_BYTES = 40 * 1024 * 1024;

/**
 * A small picture of a picture in storage, for its tile: a few kilobytes
 * rather than the whole photo, which a grid of hundreds can't scroll over.
 * Kept by the browser, as its link changes when the picture does.
 */
export async function GET(request: Request) {
  const refused = await denied('manage');
  if (refused) return refused;
  const query = new URL(request.url).searchParams;
  const bucket = query.get('bucket');
  const key = query.get('key');
  if (!bucket || !key) {
    return Response.json({ error: 'Which picture?' }, { status: 400 });
  }
  try {
    const res = await readFile(bucket, key);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) {
      await res.body?.cancel();
      return Response.json({ error: 'Too big to make small' }, { status: 413 });
    }
    const thumb = await sharp(await res.arrayBuffer())
      // Turned as its camera says, before it's cut square
      .rotate()
      .resize(SIZE, SIZE, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    return new Response(new Uint8Array(thumb), {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'private, max-age=2592000, immutable',
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
