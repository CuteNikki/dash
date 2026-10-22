import 'server-only';

import { AwsClient } from 'aws4fetch';

/** dash's own bucket in the server's image storage (Garage), as each site has its own. */
const BUCKET = 'dash';
/** Where its files are read: Caddy serves the bucket under /dash/ */
const PUBLIC_ORIGIN = 'https://images.niso.moe/dash';
/** Garage's S3 API, which takes the bucket in the path: through Caddy by default, or Garage directly */
const API_ORIGIN = process.env.STORAGE_API_URL ?? 'https://s3.niso.moe';

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

/** Stores a file in dash's bucket and returns the address it's read at. */
export async function putFile(key: string, body: ArrayBuffer, type: string) {
  const res = await storage().fetch(`${API_ORIGIN}/${BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': type },
  });
  if (!res.ok) throw new Error(`Storage answered ${res.status}`);
  return `${PUBLIC_ORIGIN}/${key}`;
}
