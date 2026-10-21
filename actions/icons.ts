'use server';

import { randomUUID } from 'node:crypto';

import { requireUser } from '@/lib/session';
import { putFile, STORAGE_PREFIX } from '@/lib/storage';

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
  await requireUser();
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'Choose a file' };
  const extension = TYPES[file.type];
  if (!extension) return { error: 'Use a PNG, SVG, WebP or JPEG' };
  if (file.size > MAX_BYTES) {
    return { error: `Keep it under ${MAX_BYTES / 1024} KB` };
  }
  try {
    const url = await putFile(
      `${STORAGE_PREFIX}icons/${randomUUID()}.${extension}`,
      await file.arrayBuffer(),
      file.type
    );
    return { url };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
