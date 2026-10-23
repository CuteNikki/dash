/**
 * What git prints, read: the pure half of lib/git.ts, apart so it can be
 * tested without git or a server.
 */
import type { GitChange, GitCommit, GitCommitFile } from '@/lib/git';

/** A commit's line in git log's output: hash, author, time and subject, tab-separated. */
export function parseCommit(line: string): GitCommit {
  const [hash, author, at, ...subject] = line.split('\t');
  return {
    hash,
    author,
    at: Number(at) * 1000,
    subject: subject.join('\t'),
  };
}

/** Splits a script's output at the marks between its parts. */
export function partsOf(stdout: string[], mark: string) {
  const parts: string[][] = [[]];
  for (const line of stdout) {
    if (line === mark) parts.push([]);
    else parts.at(-1)!.push(line);
  }
  return parts;
}

/**
 * What git printed with -z, one name or field each, as it wrote them: names
 * aren't quoted, and one with a line break, split into lines on the way, is
 * whole again. The command has an echo after it, so the mark after that is a
 * line of its own.
 */
export function fieldsOf(part: string[] | undefined) {
  return (part ?? []).join('\n').split('\0').filter(Boolean);
}

export function statusOf(xy: string): GitChange['status'] {
  if (xy === '??') return '?';
  const code = xy.trim()[0];
  return (['A', 'D', 'R'].includes(code) ? code : 'M') as GitChange['status'];
}

/**
 * Changes as `git status --porcelain=v1 -z` lists them: "XY path", and for a
 * rename or a copy, the path it had after it.
 */
export function changesOf(fields: string[]) {
  const changes: GitChange[] = [];
  for (let i = 0; i < fields.length; i++) {
    const xy = fields[i].slice(0, 2);
    const path = fields[i].slice(3);
    const from = /[RC]/.test(xy) ? fields[++i] : undefined;
    const status = statusOf(xy);
    changes.push({ status, path, ...(status === 'R' && from ? { from } : {}) });
  }
  return changes;
}

/**
 * A commit's files from its -z name-status ("M", path; a rename or copy's
 * code is followed by both paths) and numstat ("added<tab>removed<tab>path",
 * or with no path, both after it), by the path each has now.
 */
export function filesOf(statuses: string[], counts: string[]): GitCommitFile[] {
  const lines = new Map<string, { added: string; removed: string }>();
  for (let i = 0; i < counts.length; i++) {
    const [added, removed, ...path] = counts[i].split('\t');
    let file = path.join('\t');
    // A rename's: the path it had, then the one it has
    if (!file) file = counts[(i += 2)];
    lines.set(file, { added, removed });
  }
  const files: GitCommitFile[] = [];
  for (let i = 0; i < statuses.length; i++) {
    const code = statuses[i];
    if (/^[RC]/.test(code)) i++;
    const file = statuses[++i];
    if (file === undefined) break;
    const n = lines.get(file);
    const binary = !n || n.added === '-';
    files.push({
      path: file,
      status: statusOf(code),
      added: binary ? undefined : Number(n.added),
      removed: binary ? undefined : Number(n.removed),
    });
  }
  return files;
}
