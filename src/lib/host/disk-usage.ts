import 'server-only';

import { posix } from 'node:path';

import { runContainer, runToEnd, type Run } from '@/lib/docker/runner';
import type { DiskScan, FolderUsage } from '@/lib/types';

/**
 * What takes up the server's disk. Measuring it means reading every folder,
 * which takes a minute or two, so it's done in the background and kept:
 * every folder's size down to SCAN_DEPTH, deeper ones measured when they're
 * opened. du gives a folder's size as soon as it's done with it, so the
 * sizes fill in while it works, and folders can be looked into meanwhile.
 * It's read from a short-lived container with the server's disk mounted
 * read-only, staying on the disk the server runs from.
 */
const IMAGE = 'alpine:3.22';
/** Where the server's disk is mounted in the container */
const HOST = '/host';
/**
 * How deep the background measurement keeps each folder's size: deep enough
 * to browse most of the disk at once, without keeping the hundreds of
 * thousands of folders inside Docker's own storage.
 */
const SCAN_DEPTH = 8;
/** du counts in kibibytes */
const KB = 1024;
/** What a listing script prints between a folder's folders and its files */
const FILES_MARKER = '--files--';
/** The exit code for a folder that isn't there */
const MISSING = 3;

type Listing = {
  folders: string[];
  /**
   * Its folders that are another disk's, or the kernel's or memory's, such as
   * /proc or /tmp: measuring stays on this disk, so they have no size here
   */
  elsewhere: Set<string>;
  files: { name: string; size: number }[];
};

type Scan = {
  status: DiskScan;
  /** Bytes by absolute path, "/" for the whole disk, as each is measured */
  sizes: Map<string, number>;
  /** The last whole measurement's, for folders not measured again yet */
  previous: Map<string, number>;
  /** What's in each folder looked into, kept until the next measurement */
  listings: Map<string, Listing>;
};

// Kept on globalThis, so development's hot reloads keep a finished
// measurement rather than starting over
const scan: Scan = ((
  globalThis as typeof globalThis & { diskMeasurement?: Scan }
).diskMeasurement ??= {
  status: { state: 'none' },
  sizes: new Map(),
  previous: new Map(),
  listings: new Map(),
});

function run(cmd: string[]): Run {
  return {
    image: IMAGE,
    entrypoint: cmd.slice(0, 1),
    cmd: cmd.slice(1),
    workingDir: '/',
    binds: [`/:${HOST}:ro`],
  };
}

/** A line of du's: "<kibibytes>\t/host/<path>", as a size and the server's path. */
function parseDu(line: string) {
  const tab = line.indexOf('\t');
  if (tab < 0) return undefined;
  const path = line.slice(tab + 1).slice(HOST.length) || '/';
  return { path, size: Number(line.slice(0, tab)) * KB };
}

const depthOf = (path: string) =>
  path === '/' ? 0 : path.split('/').length - 1;

export function diskScan(): DiskScan {
  return scan.status;
}

/** Measures the whole disk again, in the background; once at a time. */
export function startDiskScan() {
  if (scan.status.state === 'scanning') return;
  const startedAt = Date.now();
  // The last whole measurement stands in for what's not measured again yet
  if (scan.status.state === 'done') scan.previous = scan.sizes;
  scan.sizes = new Map();
  scan.listings = new Map();
  scan.status = { state: 'scanning', startedAt, folders: 0 };
  void (async () => {
    const lines = runContainer(
      run(['du', '-xk', '-d', String(SCAN_DEPTH), HOST])
    );
    for await (const line of lines) {
      if (line.stream !== 'stdout') continue;
      const entry = parseDu(line.line);
      if (!entry) continue;
      // du's done with it, and everything in it
      scan.sizes.set(entry.path, entry.size);
      if (scan.status.state === 'scanning') {
        scan.status.folders = scan.sizes.size;
        scan.status.current = entry.path;
      }
    }
    scan.previous = new Map();
    scan.status = {
      state: 'done',
      finishedAt: Date.now(),
      folders: scan.sizes.size,
    };
  })().catch((error: Error) => {
    scan.status = { state: 'failed', error: error.message };
  });
}

/** An absolute, tidy path, or an error for one that isn't. */
function checkPath(path: string) {
  const tidy = posix.normalize(path);
  if (!tidy.startsWith('/') || tidy.includes('\0')) {
    throw new Error('Not a path on the server');
  }
  return tidy.length > 1 ? tidy.replace(/\/$/, '') : tidy;
}

/**
 * The folders and files in a folder, looked at once per measurement. Past
 * the measurement's depth, its folders are measured now, one level down.
 */
async function listing(folder: string): Promise<Listing> {
  const kept = scan.listings.get(folder);
  if (kept) return kept;
  const deeper = depthOf(folder) >= SCAN_DEPTH;
  const { exitCode, lines } = await runToEnd(
    run([
      'sh',
      '-c',
      `[ -d "$1" ] || exit ${MISSING}
${
  deeper
    ? 'du -xk -d 1 "$1"'
    : // Each with the device it's on, then the folder's own, to tell them apart
      'find "$1" -xdev -mindepth 1 -maxdepth 1 -type d -exec stat -c "%d %n" {} +; stat -c "%d" "$1"'
} 2>/dev/null
echo ${FILES_MARKER}
find "$1" -xdev -mindepth 1 -maxdepth 1 -type f -exec du -k {} + 2>/dev/null
true`,
      'sh',
      `${HOST}${folder === '/' ? '' : folder}`,
    ])
  );
  if (exitCode === MISSING) {
    throw new Error("There's no such folder, or it's on another disk");
  }
  const out = lines.filter((l) => l.stream === 'stdout').map((l) => l.line);
  const split = out.indexOf(FILES_MARKER);
  const folders: string[] = [];
  const elsewhere = new Set<string>();
  const before = out.slice(0, split);
  // Without its own device, the last line, nothing's taken for elsewhere
  const own = deeper ? undefined : before.pop();
  for (const line of before) {
    if (deeper) {
      const entry = parseDu(line);
      if (!entry || entry.path === folder) continue;
      scan.sizes.set(entry.path, entry.size);
      folders.push(posix.basename(entry.path));
    } else {
      const space = line.indexOf(' ');
      const name = posix.basename(line.slice(space + 1));
      folders.push(name);
      if (own !== undefined && line.slice(0, space) !== own)
        elsewhere.add(name);
    }
  }
  const files = out
    .slice(split + 1)
    .map(parseDu)
    .filter((f) => f !== undefined)
    .map((f) => ({ name: posix.basename(f.path), size: f.size }));
  const result = { folders, elsewhere, files };
  scan.listings.set(folder, result);
  return result;
}

/**
 * A folder's size and what's in it, biggest first. While the disk's being
 * measured, what's not done yet has no size, but the last measurement's, if
 * there was one, and comes after what's done.
 */
export async function folderUsage(path: string): Promise<FolderUsage> {
  const folder = checkPath(path);
  const { folders, elsewhere, files } = await listing(folder);
  const entry = (name: string) => {
    const full = posix.join(folder, name);
    return elsewhere.has(name)
      ? { name, elsewhere: true }
      : { name, size: scan.sizes.get(full), before: scan.previous.get(full) };
  };
  const bySize = (
    a: { size?: number; before?: number; elsewhere?: boolean },
    b: { size?: number; before?: number; elsewhere?: boolean }
  ) =>
    // Measured ones first, then the rest by what they were, and last what
    // isn't on this disk
    Number(Boolean(a.elsewhere)) - Number(Boolean(b.elsewhere)) ||
    Number(b.size !== undefined) - Number(a.size !== undefined) ||
    (b.size ?? b.before ?? 0) - (a.size ?? a.before ?? 0);
  return {
    path: folder,
    size: scan.sizes.get(folder),
    before: scan.previous.get(folder),
    folders: folders.map(entry).sort(bySize),
    files: [...files].sort(bySize),
  };
}
