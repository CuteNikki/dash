import { denied } from '@/lib/auth/access';
import { readStackImage, stackOf } from '@/lib/docker/stack-files';

/**
 * One of a stack's pictures, ?path= relative to its folder, for a Markdown
 * file there that shows it. It's shown and never run: an SVG's scripts are
 * held back by a sandbox, as anything in the stack could have put one there.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/files/image'>
) {
  const refused = await denied('manage');
  if (refused) return refused;
  const stack = await stackOf((await params).id);
  if (!stack) return Response.json({ error: 'No stack' }, { status: 404 });
  const path = new URL(request.url).searchParams.get('path') ?? '';
  try {
    const image = await readStackImage(stack, path);
    if ('reason' in image) {
      return Response.json({ error: image.reason }, { status: 404 });
    }
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        'content-type': image.type,
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
