import 'server-only';

import { randomUUID } from 'node:crypto';

import { hostOwner } from '@/lib/host-files';
import { runToEnd, STACKS_ROOT, type Run } from '@/lib/runner';

/**
 * Git, run in a short-lived container of the official image as whoever owns
 * the stack's folder, with their home as HOME: their SSH key and name sign
 * pushes and commits, and what git writes stays theirs.
 */
const GIT_IMAGE = 'alpine/git:v2.49.1';

/** Runs a shell script in the git image, with its arguments as $1, $2, … */
async function gitScript(dir: string, script: string, ...args: string[]) {
  const run: Run = {
    image: GIT_IMAGE,
    entrypoint: ['sh', '-c', script, 'sh'],
    cmd: args,
    workingDir: dir,
    user: await hostOwner(dir),
    env: {
      HOME: STACKS_ROOT,
      // Never wait for a password or a host key prompt nobody will answer
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    },
    // The server's users, as SSH won't run as one it can't look up, and the
    // image doesn't know the folder's owner
    binds: ['/etc/passwd:/etc/passwd:ro', '/etc/group:/etc/group:ro'],
  };
  const { ok, lines } = await runToEnd(run);
  return {
    ok,
    stdout: lines.filter((l) => l.stream === 'stdout').map((l) => l.line),
    output: lines.map((l) => l.line).join('\n'),
  };
}

export type GitChange = {
  /** Relative to the repository */
  path: string;
  /** M changed, A added, D deleted, R renamed, ? new and not yet tracked */
  status: 'M' | 'A' | 'D' | 'R' | '?';
};

export type GitCommit = {
  hash: string;
  author: string;
  /** Milliseconds since 1970 */
  at: number;
  subject: string;
};

export type GitStatus = {
  root: string;
  branch: string;
  /** The commit checked out, which changes with every commit, pull and switch */
  head: string;
  /** e.g. "origin/main"; undefined for a branch that doesn't track one */
  upstream?: string;
  ahead: number;
  behind: number;
  changes: GitChange[];
  branches: {
    /** Branches in this checkout */
    local: string[];
    /** Branches only on a remote, e.g. "origin/feature", to switch to */
    remote: string[];
  };
};

const MARK = '--dash--';
/** A commit's line in git log's output, as `parseCommit` reads it */
const COMMIT_FORMAT = '%h%x09%an%x09%at%x09%s';

function parseCommit(line: string): GitCommit {
  const [hash, author, at, ...subject] = line.split('\t');
  return {
    hash,
    author,
    at: Number(at) * 1000,
    subject: subject.join('\t'),
  };
}

/** Splits a script's output at the marks between its parts. */
function partsOf(stdout: string[], mark = MARK) {
  const parts: string[][] = [[]];
  for (const line of stdout) {
    if (line === mark) parts.push([]);
    else parts.at(-1)!.push(line);
  }
  return parts;
}

/** Runs from the top of the repository, which paths in it are relative to. */
const AT_ROOT = 'cd "$(git rev-parse --show-toplevel)" || exit 1';

function statusOf(xy: string): GitChange['status'] {
  if (xy === '??') return '?';
  const code = xy.trim()[0];
  return (['A', 'D', 'R'].includes(code) ? code : 'M') as GitChange['status'];
}

/** The repository a folder is in, and how it stands; undefined if none. */
export async function gitStatus(dir: string): Promise<GitStatus | undefined> {
  const { ok, stdout } = await gitScript(
    dir,
    `git rev-parse --show-toplevel 2>/dev/null || exit 0
echo ${MARK}; git rev-parse --abbrev-ref HEAD
echo ${MARK}; git rev-parse HEAD 2>/dev/null
echo ${MARK}; git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
echo ${MARK}; git rev-list --left-right --count HEAD...@{u} 2>/dev/null
echo ${MARK}; git status --porcelain=v1
echo ${MARK}; git for-each-ref --format='%(refname:short)' refs/heads
echo ${MARK}; git for-each-ref --format='%(refname:short)' refs/remotes`
  );
  if (!ok || !stdout.length) return undefined;
  const [
    [root],
    [branch],
    [head],
    [upstream],
    [counts],
    status,
    heads,
    remotes,
  ] = partsOf(stdout);
  const local = heads ?? [];
  // A remote's own HEAD isn't a branch, and ones already checked out are local
  const remote = (remotes ?? []).filter(
    (r) => r.includes('/') && !local.includes(r.slice(r.indexOf('/') + 1))
  );
  const [ahead, behind] = (counts ?? '0\t0').split(/\s+/).map(Number);
  return {
    root,
    branch,
    head: head ?? '',
    upstream: upstream || undefined,
    ahead: ahead || 0,
    behind: behind || 0,
    changes: (status ?? []).map((line) => ({
      status: statusOf(line.slice(0, 2)),
      // A rename reads "old -> new"; the new name is the file now
      path: line.slice(3).split(' -> ').at(-1)!.replace(/^"|"$/g, ''),
    })),
    branches: { local, remote },
  };
}

/**
 * Switches to a branch: a local one, one on a remote (making a local branch
 * that tracks it), or a new one made from here. Git refuses if uncommitted
 * changes would be lost, and its reason comes back.
 */
export async function gitSwitch(
  root: string,
  branch: string,
  create: boolean
): Promise<GitResult> {
  return gitScript(
    root,
    `git check-ref-format --branch "$1" >/dev/null || { echo "That's not a name a branch can have" >&2; exit 1; }
if [ "$2" = new ]; then git switch -c "$1"
elif git show-ref --verify --quiet "refs/heads/$1"; then git switch "$1"
else git switch --track "$1"; fi`,
    branch,
    create ? 'new' : 'existing'
  );
}

export type GitResult = { ok: boolean; output: string };

export async function gitFetch(root: string): Promise<GitResult> {
  return gitScript(root, 'git fetch --prune');
}

/** Only fast-forwards, so pulling never makes a merge nobody asked for. */
export async function gitPull(root: string): Promise<GitResult> {
  return gitScript(root, 'git pull --ff-only');
}

export async function gitPush(root: string): Promise<GitResult> {
  return gitScript(root, 'git push');
}

/** Commits exactly these files (new ones included) with this message. */
export async function gitCommit(
  root: string,
  message: string,
  paths: string[]
): Promise<GitResult> {
  return gitScript(
    root,
    'msg="$1"; shift; git add -A -- "$@" && git commit -q -m "$msg" -- "$@" && git log -1 --format="Committed %h %s"',
    message,
    ...paths
  );
}

/** What changed in one file: a unified diff, and the file before and after. */
export type FileDiff = {
  diff: string;
  /** Both in full, when both are text and small enough to show whole */
  sides?: { before: string; after: string };
};

/** The largest file shown whole beside its other version, in bytes. */
const MAX_SIDE = 512 * 1024;

/**
 * A shell function printing one side of a change: "absent" for a file that
 * isn't there on that side, "large" for one too big to show whole, or
 * "present" then its contents and an x, so where they end shows even
 * without a last line break. `side <rev>:<path> blob` or `side <path> file`.
 */
const SIDE = `side() {
  if [ "$2" = blob ]; then size=$(git cat-file -s "$1" 2>/dev/null) || { echo absent; return; }
  else [ -f "$1" ] || { echo absent; return; }; size=$(wc -c < "$1"); fi
  [ "$size" -le ${MAX_SIDE} ] || { echo large; return; }
  echo present
  if [ "$2" = blob ]; then git cat-file blob "$1"; else cat -- "$1"; fi
  printf 'x\\n'
}`;

/**
 * A mark between a script's parts no file's line will match, as the file's
 * own contents come between them.
 */
function uniqueMark() {
  return `--dash-${randomUUID()}--`;
}

/** A diff, then each side as \`SIDE\` printed it, each after the mark. */
function fileDiffOf(stdout: string[], mark: string): FileDiff {
  const [diff, before, after] = partsOf(stdout, mark);
  const unified = (diff ?? []).join('\n');
  const side = (part?: string[]) => {
    if (!part?.length || part[0] === 'large') return undefined;
    if (part[0] === 'absent') return '';
    return part.slice(1).join('\n').replace(/x$/, '');
  };
  const [b, a] = [side(before), side(after)];
  const binary = /^Binary files /m.test(unified);
  return {
    diff: unified,
    sides:
      !binary && b !== undefined && a !== undefined
        ? { before: b, after: a }
        : undefined,
  };
}

/**
 * What changed in one file since the last commit; a new file shows all its
 * lines. Run at the repository's top, which the path is relative to.
 */
export async function gitDiff(root: string, path: string) {
  const mark = uniqueMark();
  const { stdout } = await gitScript(
    root,
    `${SIDE}
if git ls-files --error-unmatch -- "$1" >/dev/null 2>&1
then git diff HEAD -- "$1"
else git diff --no-index -- /dev/null "$1"
fi
echo "$2"; side "HEAD:$1" blob
echo "$2"; side "$1" file`,
    path,
    mark
  );
  return fileDiffOf(stdout, mark);
}

/** A commit's own name: its hash, or the start of it. */
const HASH = /^[0-9a-f]{4,64}$/;

/**
 * The branch's commits, newest first: `count` of them after the first
 * `skip`, and whether there are older ones.
 */
export async function gitLog(dir: string, skip: number, count: number) {
  const { stdout } = await gitScript(
    dir,
    `git log --skip="$1" -n "$2" --format='${COMMIT_FORMAT}' 2>/dev/null; true`,
    String(skip),
    String(count + 1)
  );
  const commits = stdout.map(parseCommit);
  return { commits: commits.slice(0, count), more: commits.length > count };
}

export type GitCommitFile = GitChange & {
  /** Lines added and removed; undefined for a binary file */
  added?: number;
  removed?: number;
};

export type GitCommitDetails = GitCommit & {
  /** The whole hash */
  id: string;
  email: string;
  /** The message after its first line */
  body: string;
  /** What it changed, against its first parent for a merge */
  files: GitCommitFile[];
};

/** Against the first parent for a merge, as the branch saw it; renames as a deletion and an addition */
const SHOW = 'git show --format= --diff-merges=first-parent --no-renames';

/** One commit: who made it and when, its whole message, and the files it changed. */
export async function gitCommitDetails(
  dir: string,
  hash: string
): Promise<GitCommitDetails | undefined> {
  if (!HASH.test(hash)) return undefined;
  const { ok, stdout } = await gitScript(
    dir,
    `${AT_ROOT}
git rev-parse --verify --quiet "$1^{commit}" >/dev/null || exit 1
git show -s --format='%H%x09%ae%x09${COMMIT_FORMAT}' "$1"
echo ${MARK}; git show -s --format=%b "$1"
echo ${MARK}; ${SHOW} --name-status "$1"
echo ${MARK}; ${SHOW} --numstat "$1"`,
    hash
  );
  if (!ok || !stdout.length) return undefined;
  const [[first], body, statuses, counts] = partsOf(stdout);
  const [id, email, ...rest] = first.split('\t');
  const lines = new Map(
    (counts ?? []).map((line) => {
      const [added, removed, ...path] = line.split('\t');
      return [path.join('\t'), { added, removed }];
    })
  );
  return {
    ...parseCommit(rest.join('\t')),
    id,
    email,
    body: (body ?? []).join('\n').trim(),
    files: (statuses ?? []).filter(Boolean).map((line) => {
      const [code, ...path] = line.split('\t');
      const file = path.join('\t');
      const n = lines.get(file);
      const binary = !n || n.added === '-';
      return {
        path: file,
        status: statusOf(code),
        added: binary ? undefined : Number(n.added),
        removed: binary ? undefined : Number(n.removed),
      };
    }),
  };
}

/**
 * What one commit changed in one file: a unified diff, and the file before
 * (in its first parent) and after.
 */
export async function gitCommitDiff(
  dir: string,
  hash: string,
  path: string
): Promise<FileDiff> {
  if (!HASH.test(hash)) return { diff: '' };
  const mark = uniqueMark();
  const { stdout } = await gitScript(
    dir,
    `${AT_ROOT}
${SIDE}
${SHOW} "$1" -- "$2"
echo "$3"; side "$1^:$2" blob
echo "$3"; side "$1:$2" blob`,
    hash,
    path,
    mark
  );
  return fileDiffOf(stdout, mark);
}
