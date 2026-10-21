'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  BoxIcon,
  ChevronRightIcon,
  ContainerIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  HammerIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { measureDisk, pruneDocker } from '@/actions/disk';
import type { DockerSpace } from '@/lib/docker';
import { fetcher } from '@/lib/fetcher';
import { formatBytes, formatDuration } from '@/lib/format';
import type { Capacity, DiskScan, FolderUsage } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/scroll-fade';
import { CodeSkeleton } from '@/components/skeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type DiskState = {
  scan: DiskScan;
  /** Since the measurement started, or finished */
  seconds?: number;
  docker: Record<
    'images' | 'containers' | 'volumes' | 'buildCache',
    DockerSpace
  >;
};

/** How often to look in on a measurement that's underway. */
const SCANNING_POLL_MS = 1_000;

/**
 * What takes up the server's disk: Docker's share, with what nothing uses
 * and freeing it, then the disk's folders, biggest first, to look into.
 */
export function DiskDialog({
  open,
  onClose,
  disk,
}: {
  open: boolean;
  onClose: () => void;
  disk: Capacity;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='flex h-full max-w-full flex-col gap-4 rounded-none sm:h-5/6 sm:max-w-5xl sm:rounded-xl'>
        <DialogHeader>
          <DialogTitle>Disk usage</DialogTitle>
          <DialogDescription>
            {formatBytes(disk.used)} of {formatBytes(disk.size)} used,{' '}
            {formatBytes(Math.max(0, disk.total - disk.used))} free
          </DialogDescription>
        </DialogHeader>
        {open && <DiskUsage />}
      </DialogContent>
    </Dialog>
  );
}

function DiskUsage() {
  const { data, error, mutate } = useSWR<DiskState>('/api/disk', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (latest) =>
      latest?.scan.state === 'scanning' ? SCANNING_POLL_MS : 0,
  });
  const [measuring, startMeasuring] = useTransition();

  // Measured the first time it's looked at
  const state = data?.scan.state;
  useEffect(() => {
    if (state !== 'none') return;
    void measureDisk().then(() => mutate());
  }, [state, mutate]);

  if (error) return <p className='text-muted-foreground'>{error.message}</p>;
  if (!data) return <CodeSkeleton lines={10} className='flex-1' />;

  const scan = data.scan;
  return (
    <>
      <DockerSection docker={data.docker} onFreed={() => void mutate()} />
      <section className='flex min-h-0 flex-1 flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h3 className='mr-auto font-medium'>Folders</h3>
          <span className='text-muted-foreground'>
            {scan.state === 'scanning'
              ? `Measuring: ${scan.folders.toLocaleString()} folders so far`
              : scan.state === 'done'
                ? `Measured ${ago(data.seconds)}`
                : scan.state === 'failed'
                  ? `Couldn't measure: ${scan.error}`
                  : 'Not measured yet'}
          </span>
          <Button
            variant='outline'
            disabled={scan.state === 'scanning' || measuring}
            onClick={() =>
              startMeasuring(async () => {
                await measureDisk();
                await mutate();
              })
            }
          >
            <RefreshCwIcon
              className={scan.state === 'scanning' ? 'animate-spin' : undefined}
            />
            Measure again
          </Button>
        </div>
        {scan.state === 'done' ? (
          // Keyed by when it was measured, so a new measurement starts at the top
          <Folders key={scan.finishedAt} measured={scan.finishedAt} />
        ) : (
          <div className='flex flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-muted p-6 text-center text-muted-foreground'>
            <p>
              Every folder on the disk is being measured. It takes a minute or
              two, and keeps going if you close this.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

/** "just now", or how long ago, e.g. "3 min ago". */
function ago(seconds = 0) {
  return seconds < 60 ? 'just now' : `${formatDuration(seconds)} ago`;
}

const DOCKER_KINDS = [
  { key: 'images', label: 'Images', icon: <BoxIcon /> },
  { key: 'buildCache', label: 'Build cache', icon: <HammerIcon /> },
  { key: 'containers', label: 'Containers', icon: <ContainerIcon /> },
  { key: 'volumes', label: 'Volumes', icon: <DatabaseIcon /> },
] as const;

/** What freeing each kind does, for asking first. */
const PRUNES = {
  buildCache: {
    action: 'Clear',
    title: 'Clear the build cache?',
    description:
      'What no build is using is deleted. The next build of an image starts from scratch, so it takes longer.',
  },
  images: {
    action: 'Remove',
    title: 'Remove unused images?',
    description:
      'Every image no container is made from, running or stopped, is deleted. A service that needs one again downloads or builds it again.',
  },
} as const;

type Prunable = keyof typeof PRUNES;

function DockerSection({
  docker,
  onFreed,
}: {
  docker: DiskState['docker'];
  onFreed: () => void;
}) {
  const [asking, setAsking] = useState<Prunable>();
  const [pending, startTransition] = useTransition();

  function prune(what: Prunable) {
    startTransition(async () => {
      const result = await pruneDocker(what);
      if (result.ok) {
        toast.success(`Freed ${formatBytes(result.freed)}`);
        onFreed();
      } else {
        toast.error('Couldn’t free it', { description: result.error });
      }
      setAsking(undefined);
    });
  }

  return (
    <section className='flex flex-col gap-2'>
      <h3 className='font-medium'>Docker</h3>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        {DOCKER_KINDS.map(({ key, label, icon }) => {
          const space = docker[key];
          const prunable = key in PRUNES ? (key as Prunable) : undefined;
          return (
            <div
              key={key}
              className='flex flex-col gap-1 rounded-lg bg-muted p-3'
            >
              <span className='flex items-center gap-2 text-muted-foreground [&_svg]:size-4'>
                {icon}
                <span className='mr-auto'>{label}</span>
                <span className='font-mono tabular-nums'>{space.count}</span>
              </span>
              <span className='font-mono text-lg font-medium tabular-nums'>
                {formatBytes(space.size)}
              </span>
              <span className='flex min-h-6 items-center gap-2 text-muted-foreground'>
                <span className='mr-auto'>
                  {space.reclaimable > 0
                    ? `${formatBytes(space.reclaimable)} unused`
                    : 'All in use'}
                </span>
                {prunable && space.reclaimable > 0 && (
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={pending}
                    onClick={() => setAsking(prunable)}
                  >
                    {PRUNES[prunable].action}
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={asking !== undefined}
        onOpenChange={(o) => !o && !pending && setAsking(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {asking && PRUNES[asking].title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asking && PRUNES[asking].description} It frees about{' '}
              {asking && formatBytes(docker[asking].reclaimable)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={(e) => {
                // Stays open until it's done, which can take a while
                e.preventDefault();
                if (asking) prune(asking);
              }}
            >
              {pending ? 'Freeing…' : asking && PRUNES[asking].action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** The measured folders, from the top: what's in the one open, biggest first. */
function Folders({ measured }: { measured: number }) {
  const [path, setPath] = useState('/');
  const { data, error } = useSWR<FolderUsage>(
    `/api/disk/folder?path=${encodeURIComponent(path)}&measured=${measured}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const parts = path.split('/').filter(Boolean);
  const entries = data
    ? [
        ...data.folders.map((f) => ({ ...f, folder: true })),
        ...data.files.map((f) => ({ ...f, folder: false })),
      ].sort((a, b) => b.size - a.size)
    : [];

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-2'>
      <nav
        aria-label='Folder'
        className='flex flex-wrap items-center gap-1 font-mono'
      >
        {['', ...parts].map((part, i) => {
          const to = `/${parts.slice(0, i).join('/')}`;
          const here = i === parts.length;
          return (
            <span key={to} className='flex items-center gap-1'>
              {i > 0 && (
                <ChevronRightIcon className='size-3.5 text-muted-foreground' />
              )}
              <button
                type='button'
                disabled={here}
                aria-current={here ? 'page' : undefined}
                onClick={() => setPath(to)}
                className='rounded-sm px-1 text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground'
              >
                {part || 'Disk'}
              </button>
            </span>
          );
        })}
        {data && (
          <span className='ml-auto text-muted-foreground tabular-nums'>
            {formatBytes(data.size)}
          </span>
        )}
      </nav>
      {error ? (
        <p className='text-muted-foreground'>{error.message}</p>
      ) : !data ? (
        <CodeSkeleton lines={12} className='flex-1' />
      ) : (
        <div className='min-h-0 flex-1 overflow-hidden rounded-lg bg-muted'>
          <ScrollFade
            className='h-full [scrollbar-gutter:stable] overflow-auto p-1'
            fadeFrom='from-muted'
          >
            {entries.length === 0 ? (
              <p className='p-2 text-muted-foreground'>It’s empty.</p>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <li key={`${entry.folder}/${entry.name}`}>
                    <Entry
                      entry={entry}
                      share={data.size > 0 ? (entry.size / data.size) * 100 : 0}
                      onOpen={
                        entry.folder
                          ? () =>
                              setPath(
                                path === '/'
                                  ? `/${entry.name}`
                                  : `${path}/${entry.name}`
                              )
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </ScrollFade>
        </div>
      )}
    </div>
  );
}

/** One folder or file: its name, its share of the folder it's in, its size. */
function Entry({
  entry,
  share,
  onOpen,
}: {
  entry: { name: string; size: number; folder: boolean };
  share: number;
  /** For a folder, to look into it */
  onOpen?: () => void;
}) {
  const content = (
    <>
      {entry.folder ? (
        <FolderIcon className='size-3.5 shrink-0 text-muted-foreground' />
      ) : (
        <FileIcon className='size-3.5 shrink-0 text-muted-foreground' />
      )}
      <span className='min-w-0 flex-1 truncate' title={entry.name}>
        {entry.name}
      </span>
      <Progress
        value={share}
        aria-label={`${Math.round(share)}% of this folder`}
        className='hidden w-32 shrink-0 sm:block'
      />
      <span className='w-20 shrink-0 text-right font-mono tabular-nums'>
        {formatBytes(entry.size)}
      </span>
    </>
  );
  const row = 'flex w-full items-center gap-3 rounded-md px-2 py-1 text-left';
  return onOpen ? (
    <button
      type='button'
      onClick={onOpen}
      className={cn(row, 'hover:bg-background/60')}
    >
      {content}
    </button>
  ) : (
    // A file: nothing to open, and quieter than the folders beside it
    <div className={cn(row, 'text-muted-foreground')}>{content}</div>
  );
}
