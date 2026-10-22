import 'server-only';

import { imageDetails, type Container } from '@/lib/docker/docker';
import { gitFetch, gitStatus } from '@/lib/git';
import type { ServiceUpdate } from '@/lib/types';
import { listTags, parseRef, remoteDigest } from '@/lib/updates/registry';
import { newerVersion, parseVersion } from '@/lib/updates/versions';

/** How long a registry's or repository's answer is trusted before it's asked again. */
const STALE_MS = 6 * 60 * 60_000;

type Found<T> = { at: number; value?: T; error?: string };

type Checker = {
  /** What Docker has of each image: the digests it was pulled as, and its source */
  images: Map<string, { digests: string[]; source?: string }>;
  /** By image reference: the digest its tag points at, or the newest version after it */
  remote: Map<
    string,
    Found<{ digest?: string; newer?: { tag: string; major: boolean } }>
  >;
  /** By stack folder: how far its repository is behind its branch on the remote */
  repos: Map<
    string,
    Found<{ behind: number; branch: string; upstream: string }>
  >;
  checkedAt?: number;
  running?: Promise<void>;
};

// Kept on globalThis, so development's hot reloads keep what's been found
const checker: Checker = ((
  globalThis as typeof globalThis & { updateChecker?: Checker }
).updateChecker ??= { images: new Map(), remote: new Map(), repos: new Map() });

const isFixed = (image: string) => {
  const ref = parseRef(image);
  return !!ref && !!parseVersion(ref.tag);
};

const stale = (found: Found<unknown> | undefined, force: boolean) =>
  force || !found || Date.now() - found.at > STALE_MS;

async function find<T>(work: () => Promise<T | undefined>): Promise<Found<T>> {
  try {
    return { at: Date.now(), value: await work() };
  } catch (error) {
    return { at: Date.now(), error: (error as Error).message };
  }
}

/**
 * A container built here, from its stack's folder, rather than pulled: its
 * image has the name Compose gives one it builds, "<project>-<service>".
 * Docker records a digest for those too, so that can't tell them apart.
 */
const isBuilt = (c: Container) =>
  !!c.stack && c.image === `${c.stack.project}-${c.stack.service}`;

/**
 * Looks again at what's stale or not yet known: each image's own digests,
 * then each tag's image or newer versions, and each built stack's
 * repository, fetched first. All of it with force, as Check now does.
 */
async function refresh(containers: Container[], force: boolean) {
  await Promise.all(
    [...new Set(containers.map((c) => c.imageId))]
      .filter((id) => !checker.images.has(id))
      .map(async (id) => {
        const details = await imageDetails(id).catch(() => undefined);
        if (details) checker.images.set(id, details);
      })
  );

  const refs = new Set(
    containers
      .filter((c) => !isBuilt(c) && parseRef(c.image))
      .map((c) => c.image)
  );
  const dirs = new Set(containers.filter(isBuilt).map((c) => c.stack!.dir));
  await Promise.all([
    ...[...refs]
      .filter((image) => stale(checker.remote.get(image), force))
      .map(async (image) => {
        const ref = parseRef(image)!;
        checker.remote.set(
          image,
          await find(async () =>
            isFixed(image)
              ? { newer: newerVersion(ref.tag, await listTags(ref)) }
              : { digest: await remoteDigest(ref) }
          )
        );
      }),
    ...[...dirs]
      .filter((dir) => stale(checker.repos.get(dir), force))
      .map(async (dir) => {
        checker.repos.set(
          dir,
          await find(async () => {
            const before = await gitStatus(dir);
            // Not a repository, as dash's own copy isn't, or one with no branch to follow
            if (!before?.upstream) return undefined;
            const fetched = await gitFetch(before.root);
            if (!fetched.ok)
              throw new Error(fetched.output || 'git fetch failed');
            const now = await gitStatus(dir);
            return now?.upstream
              ? {
                  behind: now.behind,
                  branch: now.branch,
                  upstream: now.upstream,
                }
              : undefined;
          })
        );
      }),
  ]);
  checker.checkedAt = Date.now();
}

function start(containers: Container[], force: boolean) {
  checker.running ??= refresh(containers, force)
    .catch(console.error)
    .finally(() => {
      checker.running = undefined;
    });
  return checker.running;
}

/** What each container could be updated to, as last found. */
export function updateOf(c: Container): {
  update?: ServiceUpdate;
  error?: string;
} {
  if (isBuilt(c)) {
    const repo = checker.repos.get(c.stack!.dir);
    if (repo?.error) return { error: repo.error };
    return repo?.value?.behind
      ? { update: { kind: 'commits', ...repo.value } }
      : {};
  }
  const image = checker.images.get(c.imageId);
  if (!image) return {};
  const found = checker.remote.get(c.image);
  if (!found) return {};
  if (found.error) return { error: found.error };
  const { digest, newer } = found.value ?? {};
  if (newer) {
    return {
      update: {
        kind: 'version',
        from: parseRef(c.image)!.tag,
        to: newer.tag,
        major: newer.major,
        source: image.source,
      },
    };
  }
  if (digest && !image.digests.includes(digest)) {
    return { update: { kind: 'image', tag: parseRef(c.image)!.tag } };
  }
  return {};
}

/**
 * Each container's update, as last found, starting a look in the background
 * when anything's stale or new, as an image just pulled is. Never waits for
 * the registries, so the dashboard doesn't.
 */
export function currentUpdates(containers: Container[]) {
  const unknown = containers.some((c) => !checker.images.has(c.imageId));
  const old = !checker.checkedAt || Date.now() - checker.checkedAt > STALE_MS;
  if (unknown || old) void start(containers, false);
  return {
    byContainer: new Map(containers.map((c) => [c.id, updateOf(c)])),
    checkedAt: checker.checkedAt,
    checking: !!checker.running,
  };
}

/** Looks for updates now, everywhere, and waits until it has. */
export async function checkUpdatesNow(containers: Container[]) {
  await checker.running;
  await start(containers, true);
}

/** Forgets what was found for a container's image or repository, after updating it. */
export function forgetUpdate(c: Container) {
  checker.remote.delete(c.image);
  if (c.stack) checker.repos.delete(c.stack.dir);
}
