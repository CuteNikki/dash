import 'server-only';

import { AwsClient } from 'aws4fetch';

/** dash's own bucket in the S3 storage (Garage on the server), as each site has its own. */
const BUCKET = process.env.STORAGE_BUCKET || 'dash';
/** Where its files are read from, as https://images.example.com/dash */
const PUBLIC_URL = process.env.STORAGE_PUBLIC_URL;
/** The S3 API, which takes the bucket in the path, as https://s3.example.com */
const API_URL = process.env.STORAGE_API_URL;

function storage() {
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || !API_URL || !PUBLIC_URL) {
    throw new Error(
      'Set STORAGE_API_URL, STORAGE_PUBLIC_URL, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY to upload'
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
  const res = await storage().fetch(`${API_URL}/${BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': type },
  });
  if (!res.ok) throw new Error(`Storage answered ${res.status}`);
  return `${PUBLIC_URL}/${key}`;
}
