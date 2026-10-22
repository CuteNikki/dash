import 'server-only';

import {
  chown,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { posix } from 'node:path';

import { execRun } from '@/lib/docker/docker';

/**
 * Files on the server. The dashboard's container has the home folder mounted
 * at the same path; in development they're reached through the helper
 * container (HOST_HELPER_CONTAINER), which has it mounted too.
 */
const HELPER = process.env.HOST_HELPER_CONTAINER;

/** Runs a little shell script in the helper, with its arguments as $1, $2, … */
async function helper(script: string, ...args: string[]) {
  return execRun(HELPER!, ['sh', '-c', script, 'sh', ...args]);
}

function failed(stderr: string, what: string): never {
  throw new Error(stderr.trim() || what);
}

/** A file's text, or undefined when there's no such file. */
export async function readHostFile(path: string) {
  if (!HELPER) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  const { stdout, stderr, exitCode } = await helper(
    '[ -f "$1" ] || exit 3; cat -- "$1"',
    path
  );
  if (exitCode === 3) return undefined;
  if (exitCode !== 0) failed(stderr, `Couldn't read ${path}`);
  return stdout;
}

/** The start of a file, enough to tell text from binary. */
export async function readHostFileStart(path: string, bytes: number) {
  if (!HELPER) {
    const buffer = await readFile(path);
    return buffer.subarray(0, bytes);
  }
  const { stdout, stderr, exitCode } = await helper(
    'head -c "$2" -- "$1" | base64',
    path,
    String(bytes)
  );
  if (exitCode !== 0) failed(stderr, `Couldn't read ${path}`);
  return Buffer.from(stdout.replace(/\s/g, ''), 'base64');
}

/** Replaces a file's text, keeping its owner and permissions. */
export async function writeHostFile(path: string, content: string) {
  if (!HELPER) {
    await writeFile(path, content, 'utf8');
    return;
  }
  // Base64, so any character gets through the command line unharmed
  const { stderr, exitCode } = await helper(
    'printf %s "$1" | base64 -d > "$2"',
    Buffer.from(content, 'utf8').toString('base64'),
    path
  );
  if (exitCode !== 0) failed(stderr, `Couldn't write ${path}`);
}

/** Removes a file, if it's there. */
export async function removeHostFile(path: string) {
  if (!HELPER) {
    await rm(path, { force: true });
    return;
  }
  await helper('rm -f -- "$1"', path);
}

/** Exit code the helper's scripts use for "something's already there". */
const TAKEN = 3;

function taken(path: string): never {
  throw new Error(
    `There's already a file or folder named ${posix.basename(path)}`
  );
}

/**
 * Makes an empty file or folder, owned like the folder it's in rather than
 * by the dashboard, which runs as root. Refuses if something's already there.
 */
export async function createHostEntry(path: string, kind: 'file' | 'dir') {
  if (!HELPER) {
    if (await stat(path).catch(() => undefined)) taken(path);
    if (kind === 'dir') await mkdir(path);
    else await writeFile(path, '', { flag: 'wx' });
    const parent = await stat(posix.dirname(path));
    await chown(path, parent.uid, parent.gid);
    return;
  }
  const { stderr, exitCode } = await helper(
    `[ -e "$1" ] && exit ${TAKEN}
if [ "$2" = dir ]; then mkdir "$1"; else : > "$1"; fi || exit 1
chown "$(stat -c %u:%g "$(dirname "$1")")" "$1"`,
    path,
    kind
  );
  if (exitCode === TAKEN) taken(path);
  if (exitCode !== 0) failed(stderr, `Couldn't create ${path}`);
}

/** Moves a file or folder to a new path. Refuses if something's already there. */
export async function moveHostEntry(from: string, to: string) {
  if (!HELPER) {
    if (await stat(to).catch(() => undefined)) taken(to);
    await rename(from, to);
    return;
  }
  const { stderr, exitCode } = await helper(
    `[ -e "$2" ] && exit ${TAKEN}; mv "$1" "$2"`,
    from,
    to
  );
  if (exitCode === TAKEN) taken(to);
  if (exitCode !== 0) failed(stderr, `Couldn't rename ${from}`);
}

/** Removes a file, or a folder and everything in it. */
export async function removeHostEntry(path: string) {
  if (!HELPER) {
    await rm(path, { recursive: true, force: true });
    return;
  }
  const { stderr, exitCode } = await helper('rm -rf -- "$1"', path);
  if (exitCode !== 0) failed(stderr, `Couldn't delete ${path}`);
}

/** Who owns a file or folder, as "uid:gid". */
export async function hostOwner(path: string) {
  if (!HELPER) {
    const info = await stat(path);
    return `${info.uid}:${info.gid}`;
  }
  const { stdout, stderr, exitCode } = await helper('stat -c %u:%g "$1"', path);
  if (exitCode !== 0) failed(stderr, `Couldn't look at ${path}`);
  return stdout.trim();
}

/** Where a path really leads, following symbolic links; undefined if nowhere. */
export async function realHostPath(path: string) {
  if (!HELPER) {
    return realpath(path).catch(() => undefined);
  }
  // BusyBox's realpath takes no --; the path is always absolute anyway
  const { stdout, exitCode } = await helper('realpath "$1"', path);
  return exitCode === 0 ? stdout.trim() : undefined;
}

export type HostEntry = { name: string; kind: 'dir' | 'file'; size: number };

/** What's in a folder: its folders first, then its files, each by name. */
export async function listHostDir(path: string): Promise<HostEntry[]> {
  let entries: HostEntry[];
  if (!HELPER) {
    const dirents = await readdir(path, { withFileTypes: true });
    entries = await Promise.all(
      dirents.map(async (d) => {
        const full = posix.join(path, d.name);
        const info = await stat(full).catch(() => undefined);
        return {
          name: d.name,
          kind: info?.isDirectory() ? ('dir' as const) : ('file' as const),
          size: info?.size ?? 0,
        };
      })
    );
  } else {
    // One line per entry: d or f, its size, its name
    const { stdout, stderr, exitCode } = await helper(
      `cd -- "$1" || exit 1
for f in * .[!.]* ..?*; do
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then printf 'd\\t0\\t%s\\n' "$f"
  else printf 'f\\t%s\\t%s\\n' "$(stat -c %s -- "$f")" "$f"; fi
done`,
      path
    );
    if (exitCode !== 0) failed(stderr, `Couldn't list ${path}`);
    entries = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [kind, size, ...name] = line.split('\t');
        return {
          name: name.join('\t'),
          kind: kind === 'd' ? 'dir' : 'file',
          size: Number(size),
        };
      });
  }
  return entries.sort(
    (a, b) =>
      Number(b.kind === 'dir') - Number(a.kind === 'dir') ||
      a.name.localeCompare(b.name)
  );
}
