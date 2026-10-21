import 'server-only';

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
  /** e.g. "origin/main"; undefined for a branch that doesn't track one */
  upstream?: string;
  ahead: number;
  behind: number;
  changes: GitChange[];
  commits: GitCommit[];
  branches: {
    /** Branches in this checkout */
    local: string[];
    /** Branches only on a remote, e.g. "origin/feature", to switch to */
    remote: string[];
  };
};

const MARK = '--dash--';
const COMMITS = 15;

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
echo ${MARK}; git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
echo ${MARK}; git rev-list --left-right --count HEAD...@{u} 2>/dev/null
echo ${MARK}; git status --porcelain=v1
echo ${MARK}; git log -n ${COMMITS} --format='%h%x09%an%x09%at%x09%s'
echo ${MARK}; git for-each-ref --format='%(refname:short)' refs/heads
echo ${MARK}; git for-each-ref --format='%(refname:short)' refs/remotes`
  );
  if (!ok || !stdout.length) return undefined;
  const parts: string[][] = [[]];
  for (const line of stdout) {
    if (line === MARK) parts.push([]);
    else parts.at(-1)!.push(line);
  }
  const [[root], [branch], [upstream], [counts], status, log, heads, remotes] =
    parts;
  const local = heads ?? [];
  // A remote's own HEAD isn't a branch, and ones already checked out are local
  const remote = (remotes ?? []).filter(
    (r) => r.includes('/') && !local.includes(r.slice(r.indexOf('/') + 1))
  );
  const [ahead, behind] = (counts ?? '0\t0').split(/\s+/).map(Number);
  return {
    root,
    branch,
    upstream: upstream || undefined,
    ahead: ahead || 0,
    behind: behind || 0,
    changes: (status ?? []).map((line) => ({
      status: statusOf(line.slice(0, 2)),
      // A rename reads "old -> new"; the new name is the file now
      path: line.slice(3).split(' -> ').at(-1)!.replace(/^"|"$/g, ''),
    })),
    commits: (log ?? []).map((line) => {
      const [hash, author, at, ...subject] = line.split('\t');
      return {
        hash,
        author,
        at: Number(at) * 1000,
        subject: subject.join('\t'),
      };
    }),
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

/** What changed in one file, as a unified diff; a new file shows all its lines. */
export async function gitDiff(root: string, path: string) {
  const { stdout } = await gitScript(
    root,
    `if git ls-files --error-unmatch -- "$1" >/dev/null 2>&1
then git diff HEAD -- "$1"
else git diff --no-index -- /dev/null "$1"; true
fi`,
    path
  );
  return stdout.join('\n');
}
