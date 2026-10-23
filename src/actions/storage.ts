'use server';

import type { ActionResult } from '@/actions/containers';
import { withAccess } from '@/lib/apps/garage';
import { serviceForAction } from '@/lib/auth/access';
import { canBrowse } from '@/lib/dashboard/widgets';
import { deleteFile } from '@/lib/storage';

/** The most files deleted at once, as many as a page of a folder lists. */
const MAX_FILES = 1_000;
/** How many are asked to go at a time. */
const AT_ONCE = 8;

/** Deletes files from one of Garage's buckets, by their keys. */
export async function deleteStoredFiles(
  containerId: string,
  bucket: string,
  keys: string[]
): Promise<ActionResult> {
  const found = await serviceForAction(containerId, 'manage');
  if ('refused' in found) return { ok: false, error: found.refused };
  const { container } = found;
  if (!canBrowse(container)) {
    return { ok: false, error: 'There is nothing to browse here' };
  }
  if (keys.length > MAX_FILES) {
    return { ok: false, error: `At most ${MAX_FILES} files at once` };
  }
  try {
    await withAccess(container, bucket, async () => {
      for (let i = 0; i < keys.length; i += AT_ONCE) {
        await Promise.all(
          keys.slice(i, i + AT_ONCE).map((key) => deleteFile(bucket, key))
        );
      }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
