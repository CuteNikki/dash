import { buckets, withAccess } from '@/lib/apps/garage';
import { serviceForRoute } from '@/lib/auth/access';
import { backupBucket } from '@/lib/backups/backups';
import { canBrowse } from '@/lib/dashboard/widgets';
import {
  listFolder,
  peekFolder,
  type FolderPeek,
  type StoredPage,
} from '@/lib/storage';

/**
 * What Garage stores: without a bucket, its buckets, each with how many
 * files it holds and their size, and whether it holds the backups; with one, a page of the folder at prefix,
 * from the token after, as a StoredPage; with peek, a FolderPeek of that
 * folder instead, for its tile.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/containers/[id]/browse'>
) {
  const found = await serviceForRoute((await params).id, 'manage');
  if (found instanceof Response) return found;
  const { container } = found;
  if (!canBrowse(container)) {
    return Response.json(
      { error: 'There is nothing to browse here' },
      { status: 404 }
    );
  }
  const query = new URL(request.url).searchParams;
  const bucket = query.get('bucket');
  try {
    if (!bucket) {
      const all = await buckets(container);
      return Response.json(
        all
          .map((b) => ({ ...b, backups: b.name === backupBucket() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    const prefix = query.get('prefix') ?? '';
    const after = query.get('after') ?? undefined;
    const peek = query.has('peek');
    return Response.json(
      await withAccess<StoredPage | FolderPeek>(container, bucket, () =>
        peek ? peekFolder(bucket, prefix) : listFolder(bucket, prefix, after)
      )
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
