import 'server-only';

import { readFile, rm, writeFile } from 'node:fs/promises';

import { execRun } from '@/lib/docker';

/**
 * Files on the server. The dashboard's container has the home folder mounted
 * at the same path; in development they're reached through the helper
 * container (HOST_HELPER_CONTAINER), which has it mounted too.
 */
const HELPER = process.env.HOST_HELPER_CONTAINER;

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
  const { stdout, stderr, exitCode } = await execRun(HELPER, [
    'sh',
    '-c',
    '[ -f "$1" ] || exit 3; cat -- "$1"',
    'sh',
    path,
  ]);
  if (exitCode === 3) return undefined;
  if (exitCode !== 0) throw new Error(stderr.trim() || `Couldn't read ${path}`);
  return stdout;
}

/** Replaces a file's text, keeping its owner and permissions. */
export async function writeHostFile(path: string, content: string) {
  if (!HELPER) {
    await writeFile(path, content, 'utf8');
    return;
  }
  // Base64, so any character gets through the command line unharmed
  const { stderr, exitCode } = await execRun(HELPER, [
    'sh',
    '-c',
    'printf %s "$1" | base64 -d > "$2"',
    'sh',
    Buffer.from(content, 'utf8').toString('base64'),
    path,
  ]);
  if (exitCode !== 0)
    throw new Error(stderr.trim() || `Couldn't write ${path}`);
}

/** Removes a file, if it's there. */
export async function removeHostFile(path: string) {
  if (!HELPER) {
    await rm(path, { force: true });
    return;
  }
  await execRun(HELPER, ['rm', '-f', '--', path]);
}
