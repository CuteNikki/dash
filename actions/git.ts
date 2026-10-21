'use server';

import {
  gitCommit,
  gitFetch,
  gitPull,
  gitPush,
  gitStatus,
  type GitResult,
} from '@/lib/git';
import { requireUser } from '@/lib/session';
import { stackOf } from '@/lib/stack-files';

const MAX_MESSAGE = 5_000;

async function repoOf(containerId: string) {
  await requireUser();
  const stack = await stackOf(containerId);
  return stack && gitStatus(stack.dir);
}

const noRepo: GitResult = {
  ok: false,
  output: 'This service isn’t in a git repository',
};

/** Fetches, pulls (fast-forward only) or pushes the service's repository. */
export async function runGit(
  containerId: string,
  action: 'fetch' | 'pull' | 'push'
): Promise<GitResult> {
  const repo = await repoOf(containerId);
  if (!repo) return noRepo;
  const run = { fetch: gitFetch, pull: gitPull, push: gitPush }[action];
  if (!run) return { ok: false, output: 'Unknown action' };
  return run(repo.root);
}

/** Commits the chosen changed files with a message, and pushes if asked. */
export async function commitChanges(
  containerId: string,
  message: string,
  paths: string[],
  push: boolean
): Promise<GitResult> {
  const repo = await repoOf(containerId);
  if (!repo) return noRepo;
  const text = message.trim();
  if (!text) return { ok: false, output: 'Write what the commit does' };
  if (text.length > MAX_MESSAGE)
    return { ok: false, output: 'That message is too long' };
  // Only files git says changed, so no other path gets through
  const changed = new Set(repo.changes.map((c) => c.path));
  const chosen = paths.filter((p) => changed.has(p));
  if (!chosen.length) return { ok: false, output: 'Pick at least one file' };
  const committed = await gitCommit(repo.root, text, chosen);
  if (!committed.ok || !push) return committed;
  const pushed = await gitPush(repo.root);
  return {
    ok: pushed.ok,
    output: `${committed.output}\n${pushed.output}`.trim(),
  };
}
