import { posix } from 'node:path';

/** Text as one shell word, whatever it holds. */
export const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** What's rebuilt anyway, wherever it is in a folder, so never backed up. */
const REBUILT = ['node_modules', '.next'];

/**
 * The folders inside `path` its backups leave out: the binds, of those
 * given, that lie inside it, as a database's files a dump stands in for.
 */
export const skippedIn = (path: string, binds: string[]) =>
  binds.filter((b) => b.startsWith(`${path}/`));

/** restic backup's options for leaving out what's rebuilt and `skipped`. */
export const backupExcludes = (skipped: string[]) =>
  [
    '--exclude-caches',
    ...REBUILT.map((name) => `--exclude ${name}`),
    ...skipped.map((b) => `--exclude ${quote(b)}`),
  ].join(' ');

/**
 * restic restore's options for leaving be what the backup of `path` left
 * out, so restoring it with --delete doesn't remove them as missing from
 * the backup: restore's patterns are relative to the folder restored.
 */
export const restoreExcludes = (path: string, skipped: string[]) =>
  [
    ...REBUILT.map((name) => `--exclude ${name}`),
    ...skipped.map((b) => `--exclude ${quote(`/${posix.relative(path, b)}`)}`),
  ].join(' ');
