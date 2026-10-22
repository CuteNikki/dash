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
import type {
  Capacity,
  DiskScan,
  FolderUsage,
  MeasuredSize,
} from '@/lib/types';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/scroll-fade';
import { TextSkeleton } from '@/components/skeletons';
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
import { Skeleton } from '@/components/ui/skeleton';

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

  // Until the first answer, the same sections with placeholders in them, so
  // nothing moves when it comes
  const scan = data?.scan;
  return (
    <>
      <DockerSection docker={data?.docker} onFreed={() => void mutate()} />
      <section className='flex min-h-0 flex-1 flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h3 className='mr-auto font-medium'>Folders</h3>
          <span
            // The folder it's just done, for the curious
            title={
              scan?.state === 'scanning' && scan.current
                ? `Just did ${scan.current}`
                : undefined
            }
            className='min-w-0 truncate text-muted-foreground tabular-nums'
          >
            {!data || !scan ? (
              <TextSkeleton className='w-28' />
            ) : scan.state === 'scanning' ? (
              `Measuring… ${scan.folders.toLocaleString()} folders`
            ) : scan.state === 'done' ? (
              `Measured ${ago(data.seconds)}`
            ) : scan.state === 'failed' ? (
              `Couldn't measure: ${scan.error}`
            ) : (
              'Not measured yet'
            )}
          </span>
          <Button
            variant='outline'
            disabled={!scan || scan.state === 'scanning' || measuring}
            onClick={() =>
              startMeasuring(async () => {
                await measureDisk();
                await mutate();
              })
            }
          >
            <RefreshCwIcon
              className={
                scan?.state === 'scanning' ? 'animate-spin' : undefined
              }
            />
            Measure
          </Button>
        </div>
        {!scan || scan.state === 'none' ? (
          <FoldersSkeleton />
        ) : (
          // Sizes fill in while it's measured, which takes a minute or two
          // and keeps going with this closed
          <Folders scanning={scan.state === 'scanning'} />
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
  /** None while it's looked up: the cards show with placeholders */
  docker?: DiskState['docker'];
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
          const space = docker?.[key];
          const prunable = key in PRUNES ? (key as Prunable) : undefined;
          return (
            <div
              key={key}
              className='flex flex-col gap-1 rounded-lg bg-muted p-3'
            >
              <span className='flex items-center gap-2 text-muted-foreground [&_svg]:size-4'>
                {icon}
                <span className='mr-auto'>{label}</span>
                <span className='font-mono tabular-nums'>
                  {space ? space.count : <TextSkeleton className='w-4' />}
                </span>
              </span>
              <span className='font-mono text-lg font-medium tabular-nums'>
                {space ? (
                  formatBytes(space.size)
                ) : (
                  <TextSkeleton className='w-16' />
                )}
              </span>
              <span className='flex min-h-6 items-center gap-2 text-muted-foreground'>
                <span className='mr-auto'>
                  {!space ? (
                    <TextSkeleton className='w-20' />
                  ) : space.reclaimable > 0 ? (
                    `${formatBytes(space.reclaimable)} unused`
                  ) : (
                    'All in use'
                  )}
                </span>
                {prunable && space && space.reclaimable > 0 && (
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
              {asking && docker && formatBytes(docker[asking].reclaimable)}.
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

/** A folder or file's row in the list, and its placeholder's */
const ROW = 'flex w-full items-center gap-3 rounded-md px-2 py-1 text-left';
/** A row's bar of its share */
const BAR = 'w-12 shrink-0 sm:w-24';
/**
 * A row's size, as wide as the longest ("1023 MB"), so its bar sits beside
 * it; and "measuring…" where there's room
 */
const SIZE = 'w-[7ch] shrink-0 font-mono sm:w-[10ch]';
/** The line of folders above the list, and its placeholder's */
const BREADCRUMBS = 'flex flex-wrap items-center gap-1 font-mono';

/** How often to look in on the folder that's open while the disk's being measured. */
const FOLDER_POLL_MS = 2_000;

/**
 * Done ones biggest first, then those still being measured, by what they
 * were, and last, folders that aren't on this disk.
 */
function bySize(
  a: MeasuredSize & { elsewhere?: boolean },
  b: MeasuredSize & { elsewhere?: boolean }
) {
  return (
    Number(Boolean(a.elsewhere)) - Number(Boolean(b.elsewhere)) ||
    Number(b.size !== undefined) - Number(a.size !== undefined) ||
    (b.size ?? b.before ?? 0) - (a.size ?? a.before ?? 0)
  );
}

/**
 * The disk's folders, from the top: what's in the one open, biggest first.
 * While it's being measured, sizes fill in as each folder's done.
 */
function Folders({ scanning }: { scanning: boolean }) {
  const [path, setPath] = useState('/');
  const { data, error } = useSWR<FolderUsage>(
    // Asked again once the measurement's done, for its last sizes
    `/api/disk/folder?path=${encodeURIComponent(path)}&scanning=${scanning}`,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: scanning ? FOLDER_POLL_MS : 0,
      // The sizes so far stay while the next ones come
      keepPreviousData: true,
    }
  );
  const parts = path.split('/').filter(Boolean);
  // A folder that's moved on from shows nothing of the last one's
  const shown = data?.path === path ? data : undefined;
  const entries = shown
    ? [
        ...shown.folders.map((f) => ({ ...f, folder: true })),
        ...shown.files.map((f) => ({ ...f, folder: false })),
      ].sort(bySize)
    : [];
  // Shares of the folder, or while it's still being measured, of its biggest
  const whole = shown?.size ?? Math.max(0, ...entries.map((e) => e.size ?? 0));

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-2'>
      <nav aria-label='Folder' className={BREADCRUMBS}>
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
        {shown && (
          <span className='ml-auto text-muted-foreground tabular-nums'>
            <Size size={shown} />
          </span>
        )}
      </nav>
      {error ? (
        <p className='text-muted-foreground'>{error.message}</p>
      ) : !shown ? (
        <EntriesSkeleton />
      ) : (
        <div className='min-h-0 flex-1 overflow-hidden rounded-lg bg-muted'>
          <ScrollFade
            className='h-full [scrollbar-gutter:stable] overflow-auto p-1'
            fadeFrom='from-muted'
            fill
          >
            {entries.length === 0 ? (
              <p className='p-2 text-muted-foreground'>It’s empty.</p>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <li key={`${entry.folder}/${entry.name}`}>
                    <Entry
                      entry={entry}
                      share={
                        entry.size !== undefined && whole > 0
                          ? (entry.size / whole) * 100
                          : undefined
                      }
                      onOpen={
                        // One that's elsewhere isn't measured, so has nothing to show
                        entry.folder &&
                        !('elsewhere' in entry && entry.elsewhere)
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

/**
 * A size, or while it's still being measured, what it was last time, faded,
 * or that it's being measured.
 */
function Size({ size }: { size: MeasuredSize & { elsewhere?: boolean } }) {
  // Not on this disk: nothing of it to count
  if (size.elsewhere) return null;
  if (size.size !== undefined) return formatBytes(size.size);
  if (size.before !== undefined) {
    return (
      <span
        title='What it was last time; it’s being measured again'
        className='opacity-50'
      >
        {formatBytes(size.before)}
      </span>
    );
  }
  return (
    <span title='Being measured' className='animate-pulse opacity-50'>
      {/* A phone's size column only fits a size */}
      <span className='sm:hidden'>…</span>
      <span className='max-sm:hidden'>measuring…</span>
    </span>
  );
}

/** How many placeholder rows fill the list while it's looked up; the rest is hidden. */
const SKELETON_ROWS = 20;

/** The folders' breadcrumbs and list while there's nothing to show yet. */
function FoldersSkeleton() {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-2'>
      <nav aria-hidden className={BREADCRUMBS}>
        <TextSkeleton className='w-10' />
      </nav>
      <EntriesSkeleton />
    </div>
  );
}

/** A folder's list with rows like its entries, empty, while it's looked up. */
function EntriesSkeleton() {
  return (
    <div
      aria-busy
      aria-label='Loading'
      className='min-h-0 flex-1 overflow-hidden rounded-lg bg-muted'
    >
      {/* With the room the list keeps for its scrollbar, so the rows match */}
      <div className='h-full [scrollbar-gutter:stable] overflow-hidden p-1'>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className={ROW}>
            <Skeleton className='size-3.5 shrink-0 bg-foreground/10' />
            <span className='min-w-0 flex-1'>
              <TextSkeleton className={NAME_WIDTHS[i % NAME_WIDTHS.length]} />
            </span>
            <span className={BAR} />
            <span className={cn(SIZE, 'flex justify-end')}>
              <TextSkeleton className='w-12' />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Name lengths that look like a folder's, never all alike. */
const NAME_WIDTHS = ['w-24', 'w-16', 'w-32', 'w-20', 'w-28', 'w-12'];

/** One folder or file: its name, its share of the folder it's in, its size. */
function Entry({
  entry,
  share,
  onOpen,
}: {
  entry: MeasuredSize & { name: string; folder: boolean; elsewhere?: boolean };
  /** None while it's still being measured */
  share?: number;
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
      {/* Its room kept while it's measured, so the sizes line up */}
      <span className={BAR}>
        {share !== undefined && (
          <Progress
            value={share}
            aria-label={`${Math.round(share)}% of this folder`}
          />
        )}
      </span>
      <span className={cn(SIZE, 'text-right tabular-nums')}>
        <Size size={entry} />
      </span>
    </>
  );
  return onOpen ? (
    <button
      type='button'
      onClick={onOpen}
      className={cn(ROW, 'hover:bg-background/60')}
    >
      {content}
    </button>
  ) : (
    // A file, or a folder that isn't on this disk: nothing to open, and
    // quieter than the folders beside it
    <div
      title={
        entry.elsewhere
          ? 'Not on this disk: the system’s, memory’s, or another disk’s'
          : undefined
      }
      className={cn(ROW, 'text-muted-foreground')}
    >
      {content}
    </div>
  );
}
