'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import { CopyIcon } from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import { formatAgo } from '@/lib/format';
import type { FileDiff, GitCommit, GitCommitDetails } from '@/lib/git';

import { DiffView, type DiffLayout } from '@/components/diff-view';
import { ChangeStatus } from '@/components/git-change';
import { ScrollFade } from '@/components/scroll-fade';
import { CodeSkeleton, TextSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type LogPage = { commits: GitCommit[]; more: boolean };

/** Placeholder rows while the first commits come in, about a list's worth. */
const LOADING_ROWS = 12;
/**
 * Placeholder files while a commit's details come in: how many it changed
 * isn't known until then, and most change few.
 */
const LOADING_FILES = 1;
/** Room for this many lines of a long message before it scrolls. */
const MESSAGE = 'max-h-[6lh]';
/** Room for about six changed files before the list scrolls. */
const FILES = 'max-h-[12lh]';
/** Room above the end of the history to start fetching older commits. */
const LOAD_AHEAD = '200px';

const ROW = 'flex w-full flex-col rounded-md px-2 py-1 text-left';

/**
 * The branch's history: its commits, older ones coming in as the list is
 * scrolled to its end, and the one picked with its message and its changes.
 */
export function GitHistory({
  containerId,
  head,
  layout,
}: {
  containerId: string;
  /** The commit checked out, to read the history again once it moves */
  head: string;
  layout: DiffLayout;
}) {
  const { data, setSize, isValidating } = useSWRInfinite<LogPage>(
    // Every page before the last is full, so its size says where the next starts
    (i, previous: LogPage | null) =>
      previous && !previous.more
        ? null
        : `/api/containers/${containerId}/git/log?head=${head}&skip=${i * (previous?.commits.length ?? 0)}`,
    fetcher,
    { revalidateOnFocus: false, revalidateFirstPage: false }
  );
  const commits = data?.flatMap((page) => page.commits) ?? [];
  const more = data?.at(-1)?.more ?? false;
  const [picked, setPicked] = useState<string>();
  const shown = picked ?? commits[0]?.hash;

  // Older commits once the end of the list comes near
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || !more || isValidating) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSize((size) => size + 1);
      },
      { rootMargin: LOAD_AHEAD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, isValidating, setSize]);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
      <section
        aria-label='Commits'
        className='flex h-48 shrink-0 flex-col overflow-hidden rounded-lg bg-muted sm:h-auto sm:w-72'
      >
        <ScrollFade
          className='h-full [scrollbar-gutter:stable] overflow-auto p-1'
          fadeFrom='from-muted'
          fill
        >
          {!data ? (
            <CommitsSkeleton />
          ) : commits.length === 0 ? (
            <p className='p-2 text-muted-foreground'>No commits yet.</p>
          ) : (
            <ul className='flex flex-col gap-1'>
              {commits.map((c) => (
                <li key={c.hash}>
                  <button
                    type='button'
                    aria-current={c.hash === shown ? 'true' : undefined}
                    onClick={() => setPicked(c.hash)}
                    className={`${ROW} aria-current:bg-background`}
                  >
                    <span className='truncate' title={c.subject}>
                      {c.subject}
                    </span>
                    <span className='flex gap-2 text-muted-foreground'>
                      <span className='shrink-0 font-mono'>{c.hash}</span>
                      <span
                        className='truncate'
                        title={new Date(c.at).toLocaleString()}
                      >
                        {c.author}, {formatAgo(c.at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {more && (
                <li ref={end} aria-hidden>
                  <CommitRowSkeleton />
                </li>
              )}
            </ul>
          )}
        </ScrollFade>
      </section>
      {/* By commit, so the file picked in one doesn't carry over */}
      {shown && (
        <CommitView
          key={shown}
          containerId={containerId}
          hash={shown}
          layout={layout}
        />
      )}
    </div>
  );
}

function CommitRowSkeleton() {
  return (
    <div className={ROW}>
      <TextSkeleton className='w-4/5' />
      <TextSkeleton className='w-1/2' />
    </div>
  );
}

function CommitsSkeleton() {
  return (
    <div aria-busy aria-label='Loading' className='flex flex-col gap-1'>
      {Array.from({ length: LOADING_ROWS }, (_, i) => (
        <CommitRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** One commit: its whole message, who made it and when, and its changes file by file. */
function CommitView({
  containerId,
  hash,
  layout,
}: {
  containerId: string;
  hash: string;
  layout: DiffLayout;
}) {
  const base = `/api/containers/${containerId}/git/commits/${hash}`;
  const { data: commit, error } = useSWR<GitCommitDetails>(base, fetcher, {
    revalidateOnFocus: false,
  });
  const [picked, setPicked] = useState<string>();
  const file = picked ?? commit?.files[0]?.path;
  const { data: diff } = useSWR<FileDiff>(
    file ? `${base}/diff?path=${encodeURIComponent(file)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(`Copied ${id.slice(0, 12)}`);
    } catch {
      toast.error("Couldn't copy; select it instead");
    }
  }

  if (error) {
    return (
      <p className='flex-1 p-2 text-destructive'>
        Couldn&apos;t read that commit.
      </p>
    );
  }

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-3'>
      {/* A card, as the files and their changes under it are */}
      <div className='flex flex-col gap-1 rounded-lg bg-muted px-3 py-2'>
        {commit ? (
          <>
            <p className='font-medium'>{commit.subject}</p>
            {commit.body && (
              <p
                className={`${MESSAGE} overflow-auto whitespace-pre-wrap text-muted-foreground`}
              >
                {commit.body}
              </p>
            )}
            <div className='flex flex-wrap items-center gap-x-2 text-muted-foreground'>
              <span title={commit.email}>{commit.author}</span>
              <span>·</span>
              <span>{new Date(commit.at).toLocaleString()}</span>
              <span>·</span>
              <span className='flex items-center gap-1'>
                <span className='font-mono'>{commit.id.slice(0, 12)}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      aria-label='Copy the whole hash'
                      onClick={() => copy(commit.id)}
                    >
                      <CopyIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
              </span>
            </div>
          </>
        ) : (
          // Its subject, and who made it and when; a longer message, if it
          // has one, comes in between
          <>
            <TextSkeleton className='w-2/3' />
            <TextSkeleton className='w-1/3' />
          </>
        )}
      </div>

      {commit && commit.files.length === 0 ? (
        <p className='text-muted-foreground'>It changed no files.</p>
      ) : (
        <section
          aria-label='Changed files'
          className='shrink-0 overflow-hidden rounded-lg bg-muted'
        >
          <ScrollFade
            className={`${FILES} [scrollbar-gutter:stable] overflow-auto p-1`}
            fadeFrom='from-muted'
          >
            <ul className='flex flex-col gap-1'>
              {commit
                ? commit.files.map((f) => (
                    <li key={f.path}>
                      <button
                        type='button'
                        aria-current={f.path === file ? 'true' : undefined}
                        onClick={() => setPicked(f.path)}
                        className='flex w-full items-center gap-2 rounded-md px-2 py-1 text-left aria-current:bg-background'
                      >
                        <ChangeStatus status={f.status} />
                        <span
                          className='min-w-0 flex-1 truncate font-mono'
                          title={f.path}
                        >
                          {f.path}
                        </span>
                        <LineCounts added={f.added} removed={f.removed} />
                      </button>
                    </li>
                  ))
                : Array.from({ length: LOADING_FILES }, (_, i) => (
                    <li key={i} className='px-2 py-1'>
                      <TextSkeleton className='w-1/2' />
                    </li>
                  ))}
            </ul>
          </ScrollFade>
        </section>
      )}

      <div className='flex min-h-0 flex-1 flex-col'>
        {diff && file ? (
          <DiffView
            key={file}
            diff={diff}
            path={file}
            layout={layout}
            label={`Changes to ${file} in ${hash}`}
          />
        ) : commit && !file ? null : (
          <CodeSkeleton />
        )}
      </div>
    </div>
  );
}

/** Lines added and removed, or that it's binary, which git doesn't count in lines. */
function LineCounts({ added, removed }: { added?: number; removed?: number }) {
  if (added === undefined || removed === undefined) {
    return <span className='shrink-0 text-muted-foreground'>binary</span>;
  }
  return (
    <span className='flex shrink-0 gap-2 font-mono tabular-nums'>
      <span className='text-success'>+{added}</span>
      <span className='text-destructive'>−{removed}</span>
    </span>
  );
}
