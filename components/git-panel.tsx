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
import type { GitStatus } from '@/lib/git';

import { BranchPicker } from '@/components/branch-picker';
import { CodeEditor } from '@/components/code-editor';
import { ChangeStatus } from '@/components/git-change';
import { GitHistory } from '@/components/git-history';
import { CodeSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

/** Lines of git's output a message shows: its end, where git says how it went. */
const OUTPUT_LINES = 8;

/** What git printed, in its own lines, for under a message. */
function GitOutput({ text }: { text: string }) {
  return (
    <span className='font-mono whitespace-pre-wrap'>
      {text.trim().split('\n').slice(-OUTPUT_LINES).join('\n')}
    </span>
  );
}

/**
 * The git repository a service's stack is in: where its branch stands
 * against its remote, what's changed with each file's diff, committing the
 * chosen files, fetching, pulling and pushing, and the branch's history.
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
  // The history, when there's nothing to commit
  const [view, setView] = useState(
    status.changes.length ? 'changes' : 'history'
  );
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
      const output = result.output.trim();
      if (result.ok) {
        toast.success(done, {
          description: output && <GitOutput text={output} />,
        });
      } else {
        // Until closed, as git's reason is worth reading
        toast.error('Git refused', {
          description: <GitOutput text={output || 'It gave no reason'} />,
          duration: Infinity,
          closeButton: true,
        });
      }
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
    <Tabs
      value={view}
      onValueChange={setView}
      className='flex min-h-0 flex-1 flex-col gap-3'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <TabsList>
          <TabsTrigger value='changes'>
            Changes
            {status.changes.length > 0 && (
              <span className='font-mono text-muted-foreground tabular-nums'>
                {status.changes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value='history'>History</TabsTrigger>
        </TabsList>
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

      <TabsContent value='changes' className='flex min-h-0 flex-col'>
        {status.changes.length === 0 ? (
          <p className='rounded-lg bg-muted p-3 text-muted-foreground'>
            Nothing changed since the last commit.
          </p>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
            <div className='flex shrink-0 flex-col gap-3 sm:w-72'>
              <section
                aria-label='Changes'
                className='flex min-h-0 flex-1 flex-col gap-1 overflow-auto rounded-lg bg-muted p-1'
              >
                {status.changes.map((change) => (
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
                      <ChangeStatus status={change.status} />
                      <span className='truncate font-mono' title={change.path}>
                        {change.path}
                      </span>
                    </button>
                  </div>
                ))}
              </section>
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
            </div>

            <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
              {diff && diffPath ? (
                <CodeEditor
                  key={diffPath}
                  value={diff.diff}
                  fileName='changes.diff'
                  label={`Changes to ${diffPath}`}
                  readOnly
                />
              ) : (
                <CodeSkeleton />
              )}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value='history' className='flex min-h-0 flex-col'>
        <GitHistory containerId={containerId} head={status.head} />
      </TabsContent>
    </Tabs>
  );
}
