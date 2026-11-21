'use server';

import { randomUUID } from 'node:crypto';

import { errorText } from '@/i18n/errors';

import { requireAccess } from '@/lib/auth/access';
import { putFile } from '@/lib/storage';

/** Plenty for an icon; bigger is almost certainly a photo. */
const MAX_BYTES = 512 * 1024;

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export type UploadResult = { url: string } | { error: string };

/** Puts an icon in the image storage, for a tile to use by its address. */
export async function uploadIcon(form: FormData): Promise<UploadResult> {
  await requireAccess('manage');
  const file = form.get('file');
  if (!(file instanceof File)) return { error: await errorText('chooseFile') };
  const extension = TYPES[file.type];
  if (!extension) return { error: await errorText('imageKind') };
  if (file.size > MAX_BYTES) {
    return { error: await errorText('tooBig', { size: MAX_BYTES / 1024 }) };
  }
  try {
    const url = await putFile(
      `icons/${randomUUID()}.${extension}`,
      await file.arrayBuffer(),
      file.type
    );
    return { url };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
