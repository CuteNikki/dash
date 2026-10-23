'use server';

import type { ActionResult } from '@/actions/containers';
import { outcome, record, tried } from '@/lib/activity/record';
import { withAccess } from '@/lib/apps/garage';
import { serviceForAction } from '@/lib/auth/access';
import { canBrowse } from '@/lib/dashboard/widgets';
import { allKeys, deleteFile } from '@/lib/storage';

/** The most files deleted at once, folders' included. */
const MAX_FILES = 10_000;
/** How many are asked to go at a time. */
const AT_ONCE = 16;

/** "3 files", "1 folder"; none for none. */
const count = (n: number, one: string) =>
  n ? `${n} ${one}${n === 1 ? '' : 's'}` : '';

/**
 * Deletes files from one of Garage's buckets, by their keys; a key ending
 * in "/" is a folder, which goes with everything in it.
 */
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
  const result = await tried(() =>
    withAccess(container, bucket, async () => {
      const files: string[] = [];
      for (const key of keys) {
        if (key.endsWith('/')) {
          files.push(...(await allKeys(bucket, key, MAX_FILES)));
        } else files.push(key);
        if (files.length > MAX_FILES) {
          throw new Error(`At most ${MAX_FILES} files at once`);
        }
      }
      for (let i = 0; i < files.length; i += AT_ONCE) {
        await Promise.all(
          files.slice(i, i + AT_ONCE).map((key) => deleteFile(bucket, key))
        );
      }
    })
  );
  const folders = keys.filter((k) => k.endsWith('/')).length;
  const what = [count(folders, 'folder'), count(keys.length - folders, 'file')];
  await record(found.access, {
    action: 'storage.delete',
    target: bucket,
    detail:
      keys.length === 1
        ? keys[0]
        : `${what.filter(Boolean).join(' and ')}, ${keys[0]} first`,
    ...outcome(result),
  });
  return result;
}
