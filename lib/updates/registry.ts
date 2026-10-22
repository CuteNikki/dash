import 'server-only';

/**
 * Container registries, asked directly and anonymously: which image a tag
 * points at now, and which tags there are. Only HEAD requests for manifests,
 * which Docker Hub doesn't count against its pull limit, and tag lists.
 */

/** An image reference split up: "caddy:2.11.7" → registry-1.docker.io, library/caddy, 2.11.7. */
export type ImageRef = { registry: string; repo: string; tag: string };

const DOCKER_HUB = 'registry-1.docker.io';

/** How long an answer is trusted, and how long a registry has to give it. */
const TIMEOUT_MS = 10_000;

/** The kinds of manifest asked for: a multi-platform index first, as Docker pulls by. */
const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
].join(', ');

/** Pages of a tag list read at most, a thousand tags each. */
const MAX_PAGES = 10;

/**
 * Where an image comes from, as Docker reads its name: a first part with a
 * dot or colon, or "localhost", is a registry; otherwise it's Docker Hub,
 * whose official images are under library/. No tag is "latest". Undefined
 * for one pinned by digest, which never changes.
 */
export function parseRef(image: string): ImageRef | undefined {
  if (image.includes('@')) return undefined;
  const slash = image.indexOf('/');
  const first = slash === -1 ? '' : image.slice(0, slash);
  const remote =
    first &&
    (first.includes('.') || first.includes(':') || first === 'localhost');
  const registry = remote ? first : DOCKER_HUB;
  let path = remote ? image.slice(slash + 1) : image;
  // A tag is after the last colon, past the last slash
  const colon = path.lastIndexOf(':');
  let tag = 'latest';
  if (colon > path.lastIndexOf('/')) {
    tag = path.slice(colon + 1);
    path = path.slice(0, colon);
  }
  if (registry === DOCKER_HUB && !path.includes('/')) path = `library/${path}`;
  return { registry, repo: path, tag };
}

/** Bearer tokens, by registry and repository, until shortly before they expire. */
const tokens = new Map<string, { token?: string; until: number }>();

/**
 * A token to read a repository, as the registry's challenge says to get one:
 * none if it asks for none. Kept four minutes, as Docker Hub's last five.
 */
async function tokenFor({ registry, repo }: ImageRef) {
  const key = `${registry}/${repo}`;
  const cached = tokens.get(key);
  if (cached && cached.until > Date.now()) return cached.token;
  const challenge = await fetch(`https://${registry}/v2/`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const header = challenge.headers.get('www-authenticate') ?? '';
  const realm = header.match(/realm="([^"]+)"/)?.[1];
  let token: string | undefined;
  if (realm) {
    const url = new URL(realm);
    const service = header.match(/service="([^"]+)"/)?.[1];
    if (service) url.searchParams.set('service', service);
    url.searchParams.set('scope', `repository:${repo}:pull`);
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${registry} gave no token (${res.status})`);
    const body = (await res.json()) as {
      token?: string;
      access_token?: string;
    };
    token = body.token ?? body.access_token;
  }
  tokens.set(key, { token, until: Date.now() + 4 * 60_000 });
  return token;
}

async function registryFetch(ref: ImageRef, path: string, init?: RequestInit) {
  const token = await tokenFor(ref);
  const res = await fetch(`https://${ref.registry}/v2/${ref.repo}/${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      ...init?.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      // Docker Hub turns away an anonymous request for a repository it
      // doesn't have as if it were private
      res.status === 404 || res.status === 401
        ? `${ref.registry} has no ${ref.repo}:${ref.tag}`
        : `${ref.registry} answered ${res.status}`
    );
  }
  return res;
}

/** The digest a tag points at now, as Docker records it after pulling it. */
export async function remoteDigest(ref: ImageRef) {
  const res = await registryFetch(ref, `manifests/${ref.tag}`, {
    method: 'HEAD',
    headers: { accept: ACCEPT },
  });
  const digest = res.headers.get('docker-content-digest');
  if (!digest) throw new Error(`${ref.registry} didn't say which image it is`);
  return digest;
}

/** Every tag of a repository, up to a limit, following the registry's pages. */
export async function listTags(ref: ImageRef) {
  const tags: string[] = [];
  let path = 'tags/list?n=1000';
  for (let page = 0; page < MAX_PAGES && path; page++) {
    const res = await registryFetch(ref, path);
    tags.push(...(((await res.json()) as { tags?: string[] }).tags ?? []));
    // Link: </v2/<repo>/tags/list?last=…&n=1000>; rel="next"
    const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    path = next ? next.slice(next.indexOf('/tags/list') + 1) : '';
  }
  return tags;
}
