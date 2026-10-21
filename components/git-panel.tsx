'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  GitCommitHorizontalIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { commitChanges, runGit, switchBranch } from '@/actions/git';
import { fetcher } from '@/lib/fetcher';
import type { GitChange, GitStatus } from '@/lib/git';

import { BranchPicker } from '@/components/branch-picker';
import { CodeEditor } from '@/components/code-editor';
import { CodeSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STATUS_LABEL: Record<GitChange['status'], string> = {
  M: 'Changed',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  '?': 'New',
};

/** How long ago, in the largest unit that fits: "5 min ago", "3 days ago". */
function ago(at: number) {
  const seconds = (Date.now() - at) / 1000;
  const units: [string, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['day', 24 * 3600],
    ['h', 3600],
    ['min', 60],
  ];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) {
      const name = unit.length > 3 && n !== 1 ? `${unit}s` : unit;
      return `${n} ${name} ago`;
    }
  }
  return 'just now';
}

/**
 * The git repository a service's stack is in: where its branch stands
 * against its remote, what's changed with each file's diff, committing the
 * chosen files, and fetching, pulling and pushing.
 */
export function GitPanel({
  containerId,
  status,
  onChanged,
}: {
  containerId: string;
  status: GitStatus;
  /** After anything that changes the repository, to read it again */
  onChanged: () => Promise<unknown>;
}) {
  // Files left out of the next commit; every other changed file goes in,
  // ones that change later included
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<string | undefined>(
    status.changes[0]?.path
  );
  const [message, setMessage] = useState('');
  const [output, setOutput] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const { mutate } = useSWRConfig();

  const changed = new Set(status.changes.map((c) => c.path));
  const chosen = [...changed].filter((p) => !skipped.has(p));
  const diffPath =
    shown && changed.has(shown) ? shown : status.changes[0]?.path;
  const { data: diff } = useSWR<{ diff: string }>(
    diffPath
      ? `/api/containers/${containerId}/git/diff?path=${encodeURIComponent(diffPath)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  function act(
    run: () => Promise<{ ok: boolean; output: string }>,
    done: string
  ) {
    startTransition(async () => {
      const result = await run();
      setOutput({ ok: result.ok, text: result.output || done });
      if (result.ok) toast.success(done);
      else toast.error('Git refused', { description: 'See its output below' });
      await onChanged();
    });
  }

  function switchTo(branch: string, create: boolean) {
    act(
      async () => {
        const result = await switchBranch(containerId, branch, create);
        // The files on disk are the new branch's now: read them again
        if (result.ok) {
          await mutate(
            (key) =>
              typeof key === 'string' &&
              key.startsWith(`/api/containers/${containerId}/files`)
          );
        }
        return result;
      },
      create ? `Made and switched to ${branch}` : `Switched to ${branch}`
    );
  }

  function commit(push: boolean) {
    act(
      async () => {
        const result = await commitChanges(containerId, message, chosen, push);
        if (result.ok) setMessage('');
        return result;
      },
      push ? 'Committed and pushed' : 'Committed'
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <BranchPicker
          current={status.branch}
          local={status.branches.local}
          remote={status.branches.remote}
          disabled={pending}
          onSwitch={switchTo}
        />
        {status.upstream ? (
          <span className='font-mono text-muted-foreground'>
            {status.upstream}
          </span>
        ) : (
          <span className='text-muted-foreground'>tracks no remote branch</span>
        )}
        <span
          className='flex items-center gap-0.5 font-mono text-muted-foreground tabular-nums'
          title={`${status.ahead} to push`}
        >
          <ArrowUpIcon className='size-3.5' />
          {status.ahead}
        </span>
        <span
          className='flex items-center gap-0.5 font-mono text-muted-foreground tabular-nums'
          title={`${status.behind} to pull`}
        >
          <ArrowDownIcon className='size-3.5' />
          {status.behind}
        </span>
        <span className='ml-auto flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => act(() => runGit(containerId, 'fetch'), 'Fetched')}
          >
            <RefreshCwIcon />
            Fetch
          </Button>
          <Button
            variant='outline'
            disabled={pending || !status.upstream}
            onClick={() => act(() => runGit(containerId, 'pull'), 'Pulled')}
          >
            <ArrowDownIcon />
            Pull
          </Button>
          <Button
            variant='outline'
            disabled={pending || status.ahead === 0}
            onClick={() => act(() => runGit(containerId, 'push'), 'Pushed')}
          >
            <ArrowUpIcon />
            Push
          </Button>
        </span>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
        <div className='flex shrink-0 flex-col gap-3 sm:w-72'>
          <section
            aria-label='Changes'
            className='flex min-h-0 flex-1 flex-col gap-1 overflow-auto rounded-lg bg-muted p-1'
          >
            {status.changes.length === 0 ? (
              <p className='p-2 text-muted-foreground'>
                Nothing changed since the last commit.
              </p>
            ) : (
              status.changes.map((change) => (
                <div
                  key={change.path}
                  aria-current={change.path === diffPath ? 'true' : undefined}
                  className='flex items-center gap-2 rounded-md px-2 py-1 aria-current:bg-background'
                >
                  <Checkbox
                    checked={!skipped.has(change.path)}
                    aria-label={`Commit ${change.path}`}
                    onCheckedChange={(on) =>
                      setSkipped((s) => {
                        const next = new Set(s);
                        if (on) next.delete(change.path);
                        else next.add(change.path);
                        return next;
                      })
                    }
                  />
                  <button
                    type='button'
                    onClick={() => setShown(change.path)}
                    className='flex min-w-0 flex-1 items-center gap-2 text-left'
                  >
                    <span
                      title={STATUS_LABEL[change.status]}
                      className='w-3 shrink-0 font-mono text-muted-foreground'
                    >
                      {change.status === '?' ? 'N' : change.status}
                    </span>
                    <span className='truncate font-mono' title={change.path}>
                      {change.path}
                    </span>
                  </button>
                </div>
              ))
            )}
          </section>
          {status.changes.length > 0 && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='commit-message'>Commit message</Label>
              <Textarea
                id='commit-message'
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder='What these changes do'
              />
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  disabled={pending || !message.trim() || !chosen.length}
                  onClick={() => commit(false)}
                >
                  <GitCommitHorizontalIcon />
                  Commit {chosen.length}
                </Button>
                <Button
                  disabled={
                    pending ||
                    !message.trim() ||
                    !chosen.length ||
                    !status.upstream
                  }
                  onClick={() => commit(true)}
                >
                  <ArrowUpIcon />
                  Commit & push
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {diffPath ? (
            diff ? (
              <CodeEditor
                key={diffPath}
                value={diff.diff}
                fileName='changes.diff'
                label={`Changes to ${diffPath}`}
                readOnly
              />
            ) : (
              <CodeSkeleton />
            )
          ) : (
            <section
              aria-label='Recent commits'
              className='min-h-0 flex-1 overflow-auto rounded-lg bg-muted p-1'
            >
              <Commits commits={status.commits} />
            </section>
          )}
        </div>
      </div>

      {diffPath && status.commits.length > 0 && (
        <details className='rounded-lg bg-muted px-3 py-2'>
          <summary className='cursor-pointer text-muted-foreground'>
            Recent commits
          </summary>
          <Commits commits={status.commits} />
        </details>
      )}

      {output && (
        <pre
          role={output.ok ? 'status' : 'alert'}
          data-ok={output.ok}
          className='max-h-32 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-muted-foreground data-[ok=false]:bg-destructive/10 data-[ok=false]:text-destructive'
        >
          {output.text}
        </pre>
      )}
    </div>
  );
}

function Commits({ commits }: { commits: GitStatus['commits'] }) {
  return (
    <ul className='flex flex-col'>
      {commits.map((c) => (
        <li key={c.hash} className='flex items-baseline gap-3 px-2 py-1'>
          <span className='shrink-0 font-mono text-muted-foreground'>
            {c.hash}
          </span>
          <span className='min-w-0 flex-1 truncate' title={c.subject}>
            {c.subject}
          </span>
          <span
            className='shrink-0 text-muted-foreground'
            title={new Date(c.at).toLocaleString()}
          >
            {c.author}, {ago(c.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
