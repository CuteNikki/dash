import 'server-only';

import { AwsClient } from 'aws4fetch';

/**
 * The server's shared image storage (Garage), the bucket the plushies,
 * portfolio and Tinderhaj sites use too. Its S3 API takes the bucket in the
 * path, and everything else at the address is reading a picture.
 */
const BUCKET = 'images.niso.moe';
const PUBLIC_ORIGIN = 'https://images.niso.moe';
/** Through Caddy by default; inside the server, Garage directly */
const API_ORIGIN = process.env.STORAGE_API_URL ?? PUBLIC_ORIGIN;

/** Everything the dashboard stores goes under here, and nowhere else. */
export const STORAGE_PREFIX = 'dash/';

function storage() {
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'Set STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY to upload'
    );
  }
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'garage',
    retries: 1,
  });
}

/** Stores a file under dash/ and returns the address it's read at. */
export async function putFile(key: string, body: ArrayBuffer, type: string) {
  if (!key.startsWith(STORAGE_PREFIX)) {
    throw new Error(`Uploads go under ${STORAGE_PREFIX}`);
  }
  const res = await storage().fetch(`${API_ORIGIN}/${BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': type },
  });
  if (!res.ok) throw new Error(`Storage answered ${res.status}`);
  return `${PUBLIC_ORIGIN}/${key}`;
}

/** A file in the bucket: its key, and its size in bytes. */
export type StoredObject = { key: string; size: number };

function tag(xml: string, name: string) {
  return new RegExp(`<${name}>([\s\S]*?)</${name}>`).exec(xml)?.[1] ?? '';
}

function unescapeXml(text: string) {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Every file in the bucket, whoever put it there, a thousand at a time. */
export async function listObjects(): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let token: string | undefined;
  do {
    const url = new URL(`${API_ORIGIN}/${BUCKET}`);
    url.searchParams.set('list-type', '2');
    if (token) url.searchParams.set('continuation-token', token);
    const res = await storage().fetch(url.href, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Storage answered ${res.status} to listing`);
    const xml = await res.text();
    for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      objects.push({
        key: unescapeXml(tag(item, 'Key')),
        size: Number(tag(item, 'Size')),
      });
    }
    token = unescapeXml(tag(xml, 'NextContinuationToken')) || undefined;
  } while (token);
  return objects;
}
