import 'server-only';

import { inBackground } from '@/lib/background';
import { imageDetails, type Container } from '@/lib/docker/docker';
import { imageName } from '@/lib/format';
import { gitFetch, gitStatus } from '@/lib/git';
import type { ServiceUpdate } from '@/lib/types';
import {
  listTags,
  parseRef,
  remoteDigest,
  remoteImageDetails,
} from '@/lib/updates/registry';
import { newerVersion, parseVersion } from '@/lib/updates/versions';

/** How long a registry's or repository's answer is trusted before it's asked again. */
const STALE_MS = 6 * 60 * 60_000;

type Found<T> = { at: number; value?: T; error?: string };

type Checker = {
  /** What Docker has of each image: the digests it was pulled as, its source and version */
  images: Map<string, Awaited<ReturnType<typeof imageDetails>>>;
  /** By image reference: the digest its tag points at, or the newest version after it */
  remote: Map<
    string,
    Found<{
      digest?: string;
      /**
       * The version the newer image under its tag says it is, once it's one
       * Docker hasn't got: null when it says none, undefined until it's read
       */
      version?: string | null;
      newer?: { tag: string; major: boolean };
    }>
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
    return { at: Date.now(), error: reasonOf(error as Error) };
  }
}

/**
 * Why it failed. A request that couldn't reach its host only says "fetch
 * failed"; the network's own error is in its cause, as ETIMEDOUT or ENOTFOUND.
 */
function reasonOf(error: Error) {
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const why = cause?.code ?? cause?.message;
  return why ? `${error.message} (${why})` : error.message;
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
 * With `only`, just those containers' are looked at, the rest still there
 * to judge them by, as whether another has the newer image already.
 */
async function refresh(
  containers: Container[],
  force: boolean,
  only?: Container[]
) {
  const looked = only ?? containers;
  await Promise.all(
    [...new Set(looked.map((c) => c.imageId))]
      .filter((id) => !checker.images.has(id))
      .map(async (id) => {
        const details = await imageDetails(id).catch(() => undefined);
        if (details) checker.images.set(id, details);
      })
  );

  const refs = new Set(
    looked.filter((c) => !isBuilt(c) && parseRef(c.image)).map((c) => c.image)
  );
  const dirs = new Set(looked.filter(isBuilt).map((c) => c.stack!.dir));
  await Promise.all([
    ...[...refs]
      .filter(
        (image) =>
          stale(checker.remote.get(image), force) ||
          versionUnread(image, containers)
      )
      .map(async (image) => {
        const ref = parseRef(image)!;
        checker.remote.set(
          image,
          await find(async () =>
            isFixed(image)
              ? { newer: newerVersion(ref.tag, await listTags(ref)) }
              : await withVersion(image, await remoteDigest(ref), containers)
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
            // Not a repository, as a folder put there by hand isn't, or one with no branch to follow
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
  if (!only) checker.checkedAt = Date.now();
}

function start(containers: Container[], force: boolean) {
  // Apart from the page that asked, which may be a prerender over before it is
  checker.running ??= inBackground(() => refresh(containers, force))
    .catch(console.error)
    .finally(() => {
      checker.running = undefined;
    });
  return checker.running;
}

/** What an image's environment calls its version where that isn't its own name: PG_VERSION. */
const VERSION_NAMES: Record<string, string> = { postgres: 'PG' };

/** Something like a version: "16.15", "v3.5.2", "5.3.0_v2.1.2-ls484", not "latest" or "java25". */
const LOOKS_LIKE_VERSION = /\d+\.\d+/;

/**
 * The version an image says it is, from its version label or its
 * environment's <NAME>_VERSION, as PG_VERSION=16.15, if either looks like
 * one: the same for one Docker has and one still in the registry.
 */
function versionFrom(
  details: { versionLabel?: string; versions: Record<string, string> },
  image: string
) {
  const name = imageName(image);
  const fromEnv =
    details.versions[
      VERSION_NAMES[name] ?? name.toUpperCase().replace(/\W/g, '_')
    ];
  return [details.versionLabel, fromEnv].find(
    (v) => v && LOOKS_LIKE_VERSION.test(v)
  );
}

/**
 * A tag's digest, and when it's an image Docker hasn't got, the version
 * that image says it is, to tell a new release from a rebuild of the same.
 */
async function withVersion(
  image: string,
  digest: string,
  containers: Container[]
) {
  if (!isNewTo(image, digest, containers)) return { digest };
  const details = await remoteImageDetails(parseRef(image)!, digest).catch(
    () => undefined
  );
  return {
    digest,
    version: (details && versionFrom(details, image)) ?? null,
  };
}

/** Whether a tag's image is one Docker hasn't got, for a container that runs it. */
function isNewTo(image: string, digest: string, containers: Container[]) {
  return containers.some(
    (c) =>
      c.image === image &&
      !checker.images.get(c.imageId)?.digests.includes(digest)
  );
}

/**
 * A tag's image that's new to Docker but whose version hasn't been read,
 * as one found before it was, or once a container's image went back to an
 * older one: read without waiting for the next look.
 */
function versionUnread(image: string, containers: Container[]) {
  const value = checker.remote.get(image)?.value;
  return (
    !!value?.digest &&
    value.version === undefined &&
    isNewTo(image, value.digest, containers)
  );
}

/**
 * The version a container runs, as its image says: its tag, for one fixed
 * to a version; else its version label, or its environment's
 * <NAME>_VERSION, as PG_VERSION=16.15, if either looks like one. None for
 * one built here, whose labels are its base image's, or once it's unknown.
 */
export function versionOf(c: Container) {
  if (isBuilt(c)) return undefined;
  const tag = parseRef(c.image)?.tag;
  if (tag && parseVersion(tag)) return tag;
  const image = checker.images.get(c.imageId);
  return image && versionFrom(image, c.image);
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
    const to = found.value?.version ?? undefined;
    return {
      update: {
        kind: 'image',
        tag: parseRef(c.image)!.tag,
        to,
        rebuilt: !!to && to === versionOf(c),
      },
    };
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
  const unread = containers.some((c) => versionUnread(c.image, containers));
  if (unknown || old || unread) void start(containers, false);
  return {
    byContainer: new Map(
      containers.map((c) => [c.id, { ...updateOf(c), version: versionOf(c) }])
    ),
    checkedAt: checker.checkedAt,
    checking: !!checker.running,
  };
}

/** Looks for updates now, everywhere, and waits until it has. */
export async function checkUpdatesNow(containers: Container[]) {
  await checker.running;
  await start(containers, true);
}

/**
 * Looks for one container's update now, after any look already going on,
 * and what it found: its image's registry asked again, or its repository
 * fetched.
 */
export async function checkUpdateNow(containers: Container[], c: Container) {
  await checker.running;
  await refresh(containers, true, [c]);
  // Nothing found, as there's nowhere to look, isn't being up to date
  if (isBuilt(c)) {
    const repo = checker.repos.get(c.stack!.dir);
    if (!repo?.error && !repo?.value) {
      return {
        error:
          "Its folder isn't a git repository following a branch, so there's nowhere to look",
      };
    }
  } else if (!parseRef(c.image)) {
    return {
      error: "Its image isn't from a registry, so there's nowhere to look",
    };
  }
  return updateOf(c);
}

/** Forgets what was found for a container's image or repository, after updating it. */
export function forgetUpdate(c: Container) {
  checker.remote.delete(c.image);
  if (c.stack) checker.repos.delete(c.stack.dir);
}
