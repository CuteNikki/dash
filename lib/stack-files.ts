import 'server-only';

import { posix } from 'node:path';

import { composeOutput, type Stack } from '@/lib/compose';
import { listContainers } from '@/lib/docker';
import {
  createHostEntry,
  listHostDir,
  moveHostEntry,
  readHostFile,
  readHostFileStart,
  realHostPath,
  removeHostEntry,
  removeHostFile,
  writeHostFile,
  type HostEntry,
} from '@/lib/host-files';

/** Bigger than any config file; a file this size is data, not for editing here. */
const MAX_EDIT_BYTES = 1024 * 1024;
/** How much of a file is looked at to tell text from binary. */
const SNIFF_BYTES = 8 * 1024;

/** The compose stack a container belongs to, as Docker's labels record it. */
export async function stackOf(containerId: string): Promise<Stack | undefined> {
  const container = (await listContainers()).find((c) => c.id === containerId);
  const s = container?.stack;
  if (!s?.dir || !s.files.length) return undefined;
  return { project: s.project, dir: s.dir, files: s.files };
}

export type StackInfo = {
  dir: string;
  /** Its compose files, relative to its folder */
  compose: string[];
  /** Whether a service builds its own image, so a rebuild can be offered */
  builds: boolean;
};

export async function stackInfo(stack: Stack): Promise<StackInfo> {
  const texts = await Promise.all(stack.files.map((f) => readHostFile(f)));
  return {
    dir: stack.dir,
    compose: stack.files.map((f) => posix.relative(stack.dir, f)),
    builds: texts.some((t) => t && /^\s+build:/m.test(t)),
  };
}

const within = (dir: string, path: string) =>
  path === dir || path.startsWith(`${dir}/`);

/**
 * A path in a stack's folder, given relative to it, made absolute. Anything
 * that would lead out of the folder, by `..` or a symbolic link, is refused,
 * so only the stack's own files can be reached.
 */
async function resolve(stack: Stack, relative: string) {
  const outside = new Error("That's outside the stack's folder");
  const path = posix.normalize(posix.join(stack.dir, relative));
  if (!within(stack.dir, path)) throw outside;
  const root = (await realHostPath(stack.dir)) ?? stack.dir;
  // The folder must exist and lie inside; the file itself may be new
  const parent =
    path === stack.dir ? root : await realHostPath(posix.dirname(path));
  if (!parent || !within(root, parent)) throw outside;
  const real =
    path === stack.dir ? root : posix.join(parent, posix.basename(path));
  const target = await realHostPath(real);
  if (target && !within(root, target)) throw outside;
  return real;
}

export async function listStackDir(
  stack: Stack,
  relative: string
): Promise<HostEntry[]> {
  return listHostDir(await resolve(stack, relative));
}

export type OpenedFile =
  { content: string } | { content?: undefined; reason: string };

export async function openStackFile(
  stack: Stack,
  relative: string
): Promise<OpenedFile> {
  const path = await resolve(stack, relative);
  const siblings = await listHostDir(posix.dirname(path)).catch(() => []);
  const entry = siblings.find((e) => e.name === posix.basename(path));
  if (!entry) return { reason: "There's no such file" };
  if (entry.kind === 'dir') return { reason: "That's a folder" };
  if (entry.size > MAX_EDIT_BYTES) {
    return { reason: 'Too big to edit here; it’s data rather than a setting' };
  }
  if ((await readHostFileStart(path, SNIFF_BYTES)).includes(0)) {
    return { reason: 'Not a text file' };
  }
  return { content: (await readHostFile(path)) ?? '' };
}

export type FileResult = { ok: true } | { ok: false; error: string };

/**
 * Saves a file in a stack's folder. Its compose files and .env are checked
 * first: the new text goes in a file beside the real one, `docker compose
 * config` reads the stack with it in that one's place, and only then is the
 * real file replaced. Other files are saved as they are.
 */
export async function saveStackFile(
  stack: Stack,
  relative: string,
  content: string
): Promise<FileResult> {
  const path = await resolve(stack, relative);
  const isCompose = stack.files.includes(path);
  const isEnv = path === posix.join(stack.dir, '.env');
  if (!isCompose && !isEnv) {
    await writeHostFile(path, content);
    return { ok: true };
  }

  const candidate = posix.join(
    posix.dirname(path),
    `.dash-check-${posix.basename(path)}`
  );
  await writeHostFile(candidate, content);
  try {
    const { ok, output } = await composeOutput(
      isEnv
        ? stack
        : {
            ...stack,
            files: stack.files.map((f) => (f === path ? candidate : f)),
          },
      isEnv ? ['--env-file', candidate, 'config', '-q'] : ['config', '-q']
    );
    // Compose names the file it read; show the real one's name
    if (!ok) return { ok: false, error: output.replaceAll(candidate, path) };
  } finally {
    await removeHostFile(candidate);
  }
  await writeHostFile(path, content);
  return { ok: true };
}

/** A name for a new or renamed entry: one level, so no slashes, and not . or .. */
function checkName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A name is needed');
  if (trimmed.includes('/')) throw new Error('A name can’t contain /');
  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`${trimmed} can’t be used as a name`);
  }
  return trimmed;
}

/**
 * The stack's folder and its compose files are left alone, as are folders
 * holding them: Docker finds the stack by those paths.
 */
async function checkMovable(stack: Stack, relative: string) {
  const path = await resolve(stack, relative);
  if (path === ((await realHostPath(stack.dir)) ?? stack.dir)) {
    throw new Error('That’s the stack’s own folder');
  }
  const compose = stack.files.find((f) => within(path, f));
  if (compose) {
    throw new Error(
      `${posix.basename(compose)} is how Docker finds this stack, so it stays where it is`
    );
  }
  return path;
}

/** Makes an empty file or folder in one of the stack's folders. */
export async function createStackEntry(
  stack: Stack,
  folder: string,
  name: string,
  kind: 'file' | 'dir'
) {
  await createHostEntry(
    await resolve(stack, posix.join(folder, checkName(name))),
    kind
  );
}

/** Gives a file or folder a new name in the same folder. */
export async function renameStackEntry(
  stack: Stack,
  relative: string,
  name: string
) {
  const from = await checkMovable(stack, relative);
  const to = await resolve(
    stack,
    posix.join(posix.dirname(relative), checkName(name))
  );
  if (to !== from) await moveHostEntry(from, to);
}

/** Deletes a file, or a folder with everything in it. */
export async function deleteStackEntry(stack: Stack, relative: string) {
  await removeHostEntry(await checkMovable(stack, relative));
}
