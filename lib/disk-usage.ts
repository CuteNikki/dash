import 'server-only';

import { posix } from 'node:path';

import { runContainer, runToEnd, type Run } from '@/lib/runner';
import type { DiskScan, FolderUsage } from '@/lib/types';

/**
 * What takes up the server's disk. Measuring it means reading every folder,
 * which takes a minute or two, so it's done once in the background and kept:
 * every folder's size down to SCAN_DEPTH, deeper ones measured when they're
 * opened. It's read from a short-lived container with the server's disk
 * mounted read-only, staying on the disk the server runs from.
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

type Scan = {
  status: DiskScan;
  /** Bytes by absolute path, "/" for the whole disk */
  sizes: Map<string, number>;
  /** Folders inside each folder, by name */
  children: Map<string, string[]>;
  /** How deep from "/" the sizes go: past it, a folder hasn't been looked into */
  depth: Map<string, number>;
};

// Kept on globalThis, so development's hot reloads keep a finished
// measurement rather than starting over
const scan: Scan = ((
  globalThis as typeof globalThis & { diskScan?: Scan }
).diskScan ??= {
  status: { state: 'none' },
  sizes: new Map(),
  children: new Map(),
  depth: new Map(),
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

/** Puts a folder's size where browsing finds it, under its parent. */
function record(path: string, size: number, depth: number) {
  scan.sizes.set(path, size);
  scan.depth.set(path, depth);
  if (path === '/') return;
  const parent = posix.dirname(path);
  const siblings = scan.children.get(parent);
  const name = posix.basename(path);
  if (!siblings) scan.children.set(parent, [name]);
  else if (!siblings.includes(name)) siblings.push(name);
}

export function diskScan(): DiskScan {
  return scan.status;
}

/** Measures the whole disk again, in the background; once at a time. */
export function startDiskScan() {
  if (scan.status.state === 'scanning') return;
  const startedAt = Date.now();
  const sizes = new Map<string, number>();
  scan.status = { state: 'scanning', startedAt, folders: 0 };
  void (async () => {
    // Kept apart until it's done, so browsing shows the last whole one meanwhile
    const lines = runContainer(
      run(['du', '-xk', '-d', String(SCAN_DEPTH), HOST])
    );
    for await (const line of lines) {
      if (line.stream !== 'stdout') continue;
      const entry = parseDu(line.line);
      if (!entry) continue;
      sizes.set(entry.path, entry.size);
      if (scan.status.state === 'scanning') scan.status.folders = sizes.size;
    }
    scan.sizes = new Map();
    scan.children = new Map();
    scan.depth = new Map();
    for (const [path, size] of sizes) record(path, size, depthOf(path));
    scan.status = {
      state: 'done',
      finishedAt: Date.now(),
      folders: sizes.size,
    };
  })().catch((error: Error) => {
    scan.status = { state: 'failed', error: error.message };
  });
}

const depthOf = (path: string) =>
  path === '/' ? 0 : path.split('/').length - 1;

/** An absolute, tidy path, or an error for one that isn't. */
function checkPath(path: string) {
  const tidy = posix.normalize(path);
  if (!tidy.startsWith('/') || tidy.includes('\0')) {
    throw new Error('Not a path on the server');
  }
  return tidy.length > 1 ? tidy.replace(/\/$/, '') : tidy;
}

/**
 * A folder's size and what's in it: its folders from the measurement (a
 * folder deeper than it went is measured now), and its own files, listed now.
 */
export async function folderUsage(path: string): Promise<FolderUsage> {
  const folder = checkPath(path);
  if (scan.status.state !== 'done' && !scan.sizes.size) {
    throw new Error('The disk hasn’t been measured yet');
  }
  const size = scan.sizes.get(folder);
  if (size === undefined)
    throw new Error('There’s no such folder, or it’s on another disk');

  // At the measurement's depth, its folders are measured one level down now
  const deeper =
    (scan.depth.get(folder) ?? 0) >= SCAN_DEPTH && !scan.children.has(folder);
  const listing = await runToEnd(
    run([
      'sh',
      '-c',
      `${deeper ? 'du -xk -d 1 "$1"; ' : ''}echo --files--
find "$1" -xdev -mindepth 1 -maxdepth 1 -type f -exec du -k {} + 2>/dev/null; true`,
      'sh',
      `${HOST}${folder === '/' ? '' : folder}`,
    ])
  );
  const out = listing.lines
    .filter((l) => l.stream === 'stdout')
    .map((l) => l.line);
  const split = out.indexOf('--files--');
  if (deeper) {
    for (const line of out.slice(0, split)) {
      const entry = parseDu(line);
      if (entry && entry.path !== folder) {
        record(entry.path, entry.size, depthOf(entry.path));
      }
    }
    // Looked into, even if it has no folders
    if (!scan.children.has(folder)) scan.children.set(folder, []);
  }
  const files = out
    .slice(split + 1)
    .map(parseDu)
    .filter((f) => f !== undefined)
    .map((f) => ({ name: posix.basename(f.path), size: f.size }));

  const folders = (scan.children.get(folder) ?? []).map((name) => ({
    name,
    size: scan.sizes.get(posix.join(folder, name)) ?? 0,
  }));
  const bySize = (a: { size: number }, b: { size: number }) => b.size - a.size;
  return {
    path: folder,
    size,
    folders: folders.sort(bySize),
    files: files.sort(bySize),
  };
}
