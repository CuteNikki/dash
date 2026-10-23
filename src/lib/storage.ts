import 'server-only';

import { AwsClient } from 'aws4fetch';

import { mediaKind } from '@/lib/media';

/** The dashboard's own bucket in the S3 storage (Garage on the server), as each site has its own. */
const BUCKET = process.env.STORAGE_BUCKET || 'dash';
/** Where its files are read from, as https://images.example.com/dash */
const PUBLIC_URL = process.env.STORAGE_PUBLIC_URL;
/** The S3 API, which takes the bucket in the path, as https://s3.example.com */
const API_URL = process.env.STORAGE_API_URL;
/** How long a signed link to a file works, at the least: an hour after the hour it's signed in. */
const LINK_HOURS = 2;

/** Whether the dashboard has a key to the S3 API, to browse buckets with. */
export function hasStorageKey() {
  return !!(
    API_URL &&
    process.env.STORAGE_ACCESS_KEY_ID &&
    process.env.STORAGE_SECRET_ACCESS_KEY
  );
}

/** The dashboard's key's id, which Garage is told to let into a bucket. */
export const storageKeyId = () => process.env.STORAGE_ACCESS_KEY_ID;

function storage() {
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || !API_URL) {
    throw new Error(
      'Set STORAGE_API_URL, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY'
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

/** Stores a file in the dashboard's bucket and returns the address it's read at. */
export async function putFile(key: string, body: ArrayBuffer, type: string) {
  if (!PUBLIC_URL) {
    throw new Error('Set STORAGE_PUBLIC_URL, where uploads are read from');
  }
  const res = await storage().fetch(`${API_URL}/${BUCKET}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': type },
  });
  if (!res.ok) throw new Error(`Storage answered ${res.status}`);
  return `${PUBLIC_URL}/${key}`;
}

/** A file's address in the API: "a b/c.png" → …/bucket/a%20b/c.png */
const objectUrl = (bucket: string, key: string) =>
  `${API_URL}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Refused by the bucket, as one the key hasn't been let into yet is. */
export class NoAccess extends Error {}

/** What a request answered with, or an error with the reason S3 gave. */
async function answered(res: Response, what: string) {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  if (res.status === 403) throw new NoAccess(`No access to ${what}`);
  const message = body.match(/<Message>([^<]*)<\/Message>/)?.[1];
  throw new Error(message ?? `Storage answered ${res.status}`);
}

/** One file in a bucket. */
export type StoredFile = {
  key: string;
  /** Bytes */
  size: number;
  /** When it was last written, in milliseconds since 1970 */
  modified: number;
  /** A signed link to it, for an hour at the least */
  url: string;
  /** A small picture of it, for a picture */
  thumb?: string;
};

/** One folder's worth of a bucket: the folders in it, its files, and where the next page starts. */
export type StoredPage = {
  folders: string[];
  files: StoredFile[];
  next?: string;
};

/** XML's escapes undone, for what isn't URL-encoded. */
const unescape = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Each of a tag's values in an XML answer: every <Key> in it, and so on. */
const all = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(
    (m) => m[1]
  );

/** What S3 listed: the folders, if asked by a delimiter, each file, and where the next page starts. */
async function listing(
  client: AwsClient,
  bucket: string,
  params: Record<string, string | undefined>
) {
  const url = new URL(`${API_URL}/${encodeURIComponent(bucket)}`);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('encoding-type', 'url');
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  const res = await answered(await client.fetch(url), bucket);
  const xml = await res.text();
  // Keys come URL-encoded, as asked, so any name survives the XML
  const decode = (text: string) => decodeURIComponent(text.replace(/\+/g, ' '));
  const prefixes = xml.match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g);
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  const truncated = all(xml, 'IsTruncated')[0] === 'true';
  const next = all(xml, 'NextContinuationToken')[0];
  return {
    folders: (prefixes ?? []).flatMap((p) => all(p, 'Prefix').map(decode)),
    files: contents.map((entry) => ({
      key: decode(all(entry, 'Key')[0] ?? ''),
      size: Number(all(entry, 'Size')[0] ?? 0),
      modified: Date.parse(all(entry, 'LastModified')[0] ?? ''),
    })),
    truncated,
    next: truncated && next ? unescape(next) : undefined,
  };
}

/**
 * One page of a folder in a bucket, as S3 lists it: its folders, its files
 * each with a link to see it by, and a token for the page after.
 */
export async function listFolder(
  bucket: string,
  prefix: string,
  after?: string
): Promise<StoredPage> {
  const client = storage();
  const page = await listing(client, bucket, {
    delimiter: '/',
    prefix,
    'continuation-token': after,
  });
  return {
    folders: page.folders,
    // A folder made in a browser is an empty file named for it: not a file
    files: await Promise.all(
      page.files
        .filter((f) => f.key !== prefix)
        .map(async (f) => ({
          ...f,
          url: await signedLink(client, bucket, f.key),
          thumb: thumbLink(bucket, f.key, f.modified),
        }))
    ),
    next: page.next,
  };
}

/** The most files a folder's peek counts, and the pictures it shows. */
const PEEK_FILES = 1_000;
const PEEK_PICTURES = 4;

/** What's in a folder, at a glance: how many files, how big, and a few of its pictures. */
export type FolderPeek = {
  files: number;
  /** Bytes */
  size: number;
  /** There are more than it counted */
  more: boolean;
  /** Small pictures of its first few, in it or in folders within it */
  pictures: string[];
};

/** A look into a folder, all the way down, without listing it all. */
export async function peekFolder(
  bucket: string,
  prefix: string
): Promise<FolderPeek> {
  const client = storage();
  const page = await listing(client, bucket, {
    prefix,
    'max-keys': `${PEEK_FILES}`,
  });
  // Placeholders for folders made in a browser aren't files
  const files = page.files.filter((f) => !f.key.endsWith('/'));
  const pictures = files
    .filter((f) => mediaKind(f.key) === 'image')
    .slice(0, PEEK_PICTURES);
  return {
    files: files.length,
    size: files.reduce((sum, f) => sum + f.size, 0),
    more: page.truncated,
    pictures: pictures.flatMap(
      (f) => thumbLink(bucket, f.key, f.modified) ?? []
    ),
  };
}

/**
 * A link that shows a file without the key, for a while. Signed as of the
 * hour, so the same file has the same link all that hour, and the browser
 * shows it from its cache rather than loading it again each refresh.
 */
async function signedLink(client: AwsClient, bucket: string, key: string) {
  const hour = new Date();
  hour.setUTCMinutes(0, 0, 0);
  const url = new URL(objectUrl(bucket, key));
  url.searchParams.set('X-Amz-Expires', `${LINK_HOURS * 60 * 60}`);
  const signed = await client.sign(url, {
    method: 'GET',
    aws: {
      signQuery: true,
      // 20261023T140000Z
      datetime: hour.toISOString().replace(/[:-]|\.\d{3}/g, ''),
    },
  });
  return signed.url;
}

/**
 * The dashboard's own link to a small picture of a picture, by when it was
 * written, so a new one under the same name is a new link and an old one
 * can be kept by the browser; none for one that can't be made smaller.
 */
function thumbLink(bucket: string, key: string, modified: number) {
  if (!THUMBABLE.test(key)) return undefined;
  return `/api/storage/thumb?${new URLSearchParams({ bucket, key, v: `${modified}` })}`;
}

/** Pictures sharp can read; the rest are shown as they are. */
const THUMBABLE = /\.(png|jpe?g|gif|webp|avif|tiff?|svg)$/i;

/** A file, as the storage answers with it. */
export async function readFile(bucket: string, key: string) {
  return answered(await storage().fetch(objectUrl(bucket, key)), bucket);
}

/** Deletes a file from a bucket; one already gone is fine. */
export async function deleteFile(bucket: string, key: string) {
  const res = await storage().fetch(objectUrl(bucket, key), {
    method: 'DELETE',
  });
  if (res.status !== 404) await answered(res, bucket);
}
