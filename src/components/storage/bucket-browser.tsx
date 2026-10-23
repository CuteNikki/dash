'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import {
  ArrowUpIcon,
  ExternalLinkIcon,
  FileIcon,
  FileVideoIcon,
  FolderIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';

import { deleteStoredFiles } from '@/actions/storage';
import { fetcher } from '@/lib/fetcher';
import { formatBytes, formatMoment } from '@/lib/format';
import { mediaKind } from '@/lib/media';
import type { FolderPeek, StoredFile, StoredPage } from '@/lib/storage';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/common/scroll-fade';
import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKept } from '@/components/common/use-kept';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** How far ahead of the grid's end its next page is asked for. */
const LOAD_AHEAD = '400px';

type Bucket = { name: string; objects: number; size: number };

/** "icons/a/cat.png" → "cat.png"; "icons/a/" → "a" */
const nameOf = (path: string) => path.replace(/\/$/, '').split('/').pop()!;

const ROW = 'flex w-full flex-col rounded-md px-2 py-1 text-left';

/**
 * A tile, drawn only near the view: hundreds of them scroll smoothly, the
 * ones out of sight kept at about their size until they come back.
 */
const TILE = '[contain-intrinsic-size:auto_12rem] [content-visibility:auto]';

/**
 * What Garage stores: its buckets in a list, and the one picked as a grid,
 * its folders to open and its files to look at, each a picture where it is
 * one, picked to delete one or many at a time.
 */
export function BucketBrowser({ containerId }: { containerId: string }) {
  const base = `/api/containers/${containerId}/browse`;
  const {
    data: buckets,
    error: bucketsError,
    mutate: rereadBuckets,
  } = useSWR<Bucket[]>(base, fetcher, { revalidateOnFocus: false });
  // Where it was left, for coming back to the tab or the window; picking a
  // bucket opens it at its top, the folder that was open in it forgotten
  const [at, setAt] = useKept<{ bucket?: string; prefix: string }>(
    `browse:${containerId}:at`,
    { prefix: '' }
  );
  const bucket = at.bucket ?? buckets?.[0]?.name;
  const prefix = at.bucket ? at.prefix : '';

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 sm:flex-row'>
      {/* On a phone, the buckets to pick from in a menu, the grid having the room */}
      <Select
        value={bucket ?? ''}
        onValueChange={(name) => setAt({ bucket: name, prefix: '' })}
        disabled={!buckets?.length}
      >
        <SelectTrigger
          aria-label='Bucket'
          className='w-full font-mono sm:hidden'
        >
          <SelectValue
            placeholder={
              bucketsError && !buckets
                ? `Couldn't list the buckets: ${bucketsError.message}`
                : buckets
                  ? 'No buckets yet'
                  : 'Reading the buckets…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {buckets?.map((b) => (
            <SelectItem key={b.name} value={b.name} className='pr-7 font-mono'>
              {b.name}
              <span className='font-sans text-muted-foreground tabular-nums'>
                {b.objects} {b.objects === 1 ? 'file' : 'files'} ·{' '}
                {formatBytes(b.size)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <section
        aria-label='Buckets'
        className='hidden shrink-0 flex-col overflow-hidden rounded-lg bg-muted sm:flex sm:w-60'
      >
        <ScrollFade
          className='h-full scrollbar-gutter-stable overflow-auto p-1'
          fadeFrom='from-muted'
          fill
        >
          {bucketsError && !buckets ? (
            <p className='p-2 text-muted-foreground'>
              Couldn&apos;t list the buckets: {bucketsError.message}
            </p>
          ) : !buckets ? (
            <div className='flex flex-col gap-3 p-2'>
              <TextSkeleton className='w-2/3' />
              <TextSkeleton className='w-1/2' />
              <TextSkeleton className='w-3/4' />
            </div>
          ) : buckets.length === 0 ? (
            <p className='p-2 text-muted-foreground'>No buckets yet.</p>
          ) : (
            <ul className='flex flex-col gap-1'>
              {buckets.map((b) => (
                <li key={b.name}>
                  <button
                    type='button'
                    onClick={() => setAt({ bucket: b.name, prefix: '' })}
                    aria-current={b.name === bucket || undefined}
                    className={cn(
                      ROW,
                      'hover:bg-foreground/5',
                      b.name === bucket &&
                        'bg-foreground/10 hover:bg-foreground/10'
                    )}
                  >
                    <span className='truncate font-mono'>{b.name}</span>
                    <span className='text-muted-foreground tabular-nums'>
                      {b.objects} {b.objects === 1 ? 'file' : 'files'} ·{' '}
                      {formatBytes(b.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollFade>
      </section>
      {bucket && (
        // By bucket and folder, so what's picked and loaded starts afresh in each
        <Folder
          key={`${bucket}/${prefix}`}
          base={base}
          containerId={containerId}
          bucket={bucket}
          prefix={prefix}
          onOpenAction={(prefix) => setAt({ bucket, prefix })}
          onDeletedAction={() => void rereadBuckets()}
        />
      )}
    </div>
  );
}

function Folder({
  base,
  containerId,
  bucket,
  prefix,
  onOpenAction,
  onDeletedAction,
}: {
  base: string;
  containerId: string;
  bucket: string;
  /** The folder open, "" for the bucket's top, else ending in "/" */
  prefix: string;
  onOpenAction: (prefix: string) => void;
  /** Called once files are gone, so the bucket's totals are read again */
  onDeletedAction: () => void;
}) {
  const { data, error, setSize, isValidating, mutate } =
    useSWRInfinite<StoredPage>(
      (_i, previous: StoredPage | null) =>
        previous && !previous.next
          ? null
          : `${base}?${new URLSearchParams({
              bucket,
              prefix,
              ...(previous?.next && { after: previous.next }),
            })}`,
      fetcher,
      { revalidateOnFocus: false, revalidateFirstPage: false }
    );
  const folders = data?.flatMap((page) => page.folders) ?? [];
  const files = data?.flatMap((page) => page.files) ?? [];
  const more = !!data?.at(-1)?.next;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<StoredFile>();
  const [confirming, setConfirming] = useState<string[]>();
  const [pending, startTransition] = useTransition();

  // The next page once the end of the grid comes near
  const end = useRef<HTMLDivElement>(null);
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

  function toggle(key: string, on: boolean) {
    setSelected((was) => {
      const next = new Set(was);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function remove(keys: string[]) {
    startTransition(() =>
      attempt(`Couldn't delete from ${bucket}`, async () => {
        const result = await deleteStoredFiles(containerId, bucket, keys);
        if (!result.ok) {
          toast.error(`Couldn't delete from ${bucket}`, {
            description: result.error,
          });
          return;
        }
        toast.success(
          keys.length === 1
            ? `Deleted ${nameOf(keys[0])}`
            : `Deleted ${keys.length} files`
        );
        setSelected((was) => {
          const next = new Set(was);
          for (const key of keys) next.delete(key);
          return next;
        });
        setViewing(undefined);
        await mutate();
        onDeletedAction();
      })
    );
  }

  // The bucket, then each folder down to the one open, to go back up to
  const crumbs = prefix
    .split('/')
    .filter(Boolean)
    .map((name, i, all) => ({
      name,
      prefix: `${all.slice(0, i + 1).join('/')}/`,
    }));
  const all = files.length > 0 && files.every((f) => selected.has(f.key));

  return (
    <section
      aria-label={`${bucket}/${prefix}`}
      className='flex min-h-0 min-w-0 flex-1 flex-col gap-3'
    >
      {/* Where it is on a line of its own, the folders above shortening
          first, and what's picked beside it where there's room */}
      <div className='flex min-h-7 flex-wrap items-center gap-2'>
        <div className='flex min-w-0 flex-1 basis-48 items-center gap-1'>
          {prefix && (
            <Button
              variant='ghost'
              size='icon'
              aria-label='Up a folder'
              title='Up a folder'
              onClick={() => onOpenAction(crumbs.at(-2)?.prefix ?? '')}
            >
              <ArrowUpIcon />
            </Button>
          )}
          <nav
            aria-label='Folder'
            className='flex min-w-0 flex-1 items-center overflow-hidden font-mono whitespace-nowrap'
          >
            {[{ name: bucket, prefix: '' }, ...crumbs].map((c, i, all) => {
              const last = i === all.length - 1;
              return (
                <Fragment key={c.prefix}>
                  {i > 0 && (
                    <span className='shrink-0 text-muted-foreground'>/</span>
                  )}
                  <button
                    type='button'
                    title={c.name}
                    aria-current={last || undefined}
                    className={cn(
                      'min-w-0 truncate rounded-sm px-1 hover:bg-foreground/5',
                      last ? 'shrink' : 'shrink-4 text-muted-foreground'
                    )}
                    onClick={() => onOpenAction(c.prefix)}
                  >
                    {c.name}
                  </button>
                </Fragment>
              );
            })}
          </nav>
        </div>
        <div className='ml-auto flex items-center gap-2'>
          {files.length > 0 && (
            <label className='flex items-center gap-2 whitespace-nowrap text-muted-foreground'>
              <Checkbox
                checked={all ? true : selected.size ? 'indeterminate' : false}
                onCheckedChange={(on) =>
                  setSelected(
                    on === true ? new Set(files.map((f) => f.key)) : new Set()
                  )
                }
              />
              {selected.size ? `${selected.size} picked` : 'Pick all'}
            </label>
          )}
          {selected.size > 0 && (
            <Button
              variant='destructive'
              disabled={pending}
              onClick={() => setConfirming([...selected])}
            >
              <Trash2Icon />
              Delete
            </Button>
          )}
          <Button
            variant='outline'
            size='icon'
            aria-label='Read again'
            title='Read again'
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCwIcon className={cn(isValidating && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* What's left of the column, the grid scrolling within it */}
      <div className='min-h-0 flex-1'>
        <ScrollFade
          className='h-full overflow-x-hidden overflow-y-auto'
          fadeFrom='from-popover'
          fill
        >
          {error && !data ? (
            <p className='text-muted-foreground'>
              Couldn&apos;t read {bucket}: {error.message}
            </p>
          ) : !data ? (
            <TileGrid>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className='aspect-square rounded-lg bg-muted' />
              ))}
            </TileGrid>
          ) : folders.length === 0 && files.length === 0 ? (
            <p className='text-muted-foreground'>
              {prefix ? 'This folder is empty.' : 'This bucket is empty.'}
            </p>
          ) : (
            <TileGrid>
              {folders.map((folder) => (
                <FolderTile
                  key={folder}
                  base={base}
                  bucket={bucket}
                  folder={folder}
                  onOpenAction={() => onOpenAction(folder)}
                />
              ))}
              {files.map((file) => (
                <FileTile
                  key={file.key}
                  file={file}
                  picked={selected.has(file.key)}
                  picking={selected.size > 0}
                  onPickAction={(on) => toggle(file.key, on)}
                  onOpenAction={() => setViewing(file)}
                />
              ))}
            </TileGrid>
          )}
          <div ref={end} />
        </ScrollFade>
      </div>

      <FileView
        file={viewing}
        pending={pending}
        onCloseAction={() => setViewing(undefined)}
        onDeleteAction={(file) => setConfirming([file.key])}
      />
      <AlertDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{' '}
              {confirming?.length === 1
                ? nameOf(confirming[0])
                : `${confirming?.length} files`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.length === 1 ? 'It goes' : 'They go'} from {bucket}{' '}
              for good, and anything showing{' '}
              {confirming?.length === 1 ? 'it' : 'them'} stops being able to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => confirming && remove(confirming)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3'>
      {children}
    </div>
  );
}

/**
 * A small picture of a picture, made by the dashboard; the picture itself
 * where it can't be, or nothing where neither shows.
 */
function Thumb({ src, fallback }: { src?: string; fallback?: string }) {
  const [failed, setFailed] = useState(!src);
  const shown = failed ? fallback : src;
  if (!shown) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      alt=''
      loading='lazy'
      decoding='async'
      onError={() => !failed && setFailed(true)}
      className='size-full min-h-0 object-cover'
    />
  );
}

/** Whether an element has come into view yet, and stays so once it has. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin: LOAD_AHEAD }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/**
 * A folder as a tile: a few of the pictures in it, how many files it holds
 * and how big they are, looked into once it comes near the view, as a page
 * can hold a thousand folders.
 */
function FolderTile({
  base,
  bucket,
  folder,
  onOpenAction,
}: {
  base: string;
  bucket: string;
  folder: string;
  onOpenAction: () => void;
}) {
  const [ref, seen] = useSeen<HTMLButtonElement>();
  const { data: peek } = useSWR<FolderPeek>(
    seen
      ? `${base}?${new URLSearchParams({ bucket, prefix: folder, peek: '' })}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const pictures = peek?.pictures ?? [];
  return (
    <button
      ref={ref}
      type='button'
      onClick={onOpenAction}
      className={cn(
        TILE,
        'flex flex-col overflow-hidden rounded-lg border border-foreground/10 bg-muted text-left hover:border-foreground/25 dark:bg-muted/40'
      )}
    >
      {pictures.length ? (
        // One picture whole, two side by side, more as four
        <span
          className={cn(
            'grid aspect-square gap-px bg-foreground/10',
            pictures.length > 1 && 'grid-cols-2',
            pictures.length > 2 && 'grid-rows-2'
          )}
        >
          {pictures.map((url) => (
            <Thumb key={url} src={url} />
          ))}
        </span>
      ) : (
        <span className='flex aspect-square items-center justify-center bg-foreground/5 text-muted-foreground'>
          <FolderIcon className='size-10' strokeWidth={1.25} />
        </span>
      )}
      <span className='flex flex-col border-t border-foreground/10 px-2 py-1.5'>
        <span className='flex min-w-0 items-center gap-1.5'>
          <FolderIcon className='size-3.5 shrink-0 text-muted-foreground' />
          <span className='truncate font-mono'>{nameOf(folder)}</span>
        </span>
        <span className='text-muted-foreground tabular-nums'>
          {peek ? (
            `${peek.files}${peek.more ? '+' : ''} ${peek.files === 1 && !peek.more ? 'file' : 'files'} · ${formatBytes(peek.size)}`
          ) : (
            <TextSkeleton className='w-2/3' />
          )}
        </span>
      </span>
    </button>
  );
}

/** A file as a tile: a picture of it where it's one, its name and size, and a box to pick it by. */
function FileTile({
  file,
  picked,
  picking,
  onPickAction,
  onOpenAction,
}: {
  file: StoredFile;
  picked: boolean;
  /** Some are picked: every box shows, to pick more by */
  picking: boolean;
  onPickAction: (on: boolean) => void;
  onOpenAction: () => void;
}) {
  const kind = mediaKind(file.key);
  return (
    <div
      className={cn(
        TILE,
        'group relative flex flex-col overflow-hidden rounded-lg border bg-muted dark:bg-muted/40',
        picked
          ? 'border-primary'
          : 'border-foreground/10 hover:border-foreground/25'
      )}
    >
      <button
        type='button'
        onClick={onOpenAction}
        className='flex flex-col text-left'
        aria-label={`Look at ${nameOf(file.key)}`}
      >
        <span className='flex aspect-square items-center justify-center overflow-hidden bg-foreground/5'>
          {kind === 'image' ? (
            <Thumb src={file.thumb} fallback={file.url} />
          ) : kind === 'video' ? (
            // An icon, not the video: a grid of them loading would crawl
            <FileVideoIcon
              className='size-10 text-muted-foreground'
              strokeWidth={1.25}
            />
          ) : (
            <FileIcon
              className='size-10 text-muted-foreground'
              strokeWidth={1.25}
            />
          )}
        </span>
        <span className='flex flex-col border-t border-foreground/10 px-2 py-1.5'>
          <span className='truncate font-mono'>{nameOf(file.key)}</span>
          <span className='text-muted-foreground tabular-nums'>
            {formatBytes(file.size)}
          </span>
        </span>
      </button>
      {/* Shown once it's pointed at or any are picked, so the pictures are
          clear otherwise */}
      <Checkbox
        checked={picked}
        onCheckedChange={(on) => onPickAction(on === true)}
        aria-label={`Pick ${nameOf(file.key)}`}
        // Solid, and bordered strongly, to be seen against any picture
        className={cn(
          'absolute top-2 left-2 size-5 border-foreground/50 bg-background/90 shadow-md backdrop-blur-sm',
          !picked &&
            !picking &&
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
        )}
      />
    </div>
  );
}

/** A file large, as it is, with when it was written, to open or delete. */
function FileView({
  file,
  pending,
  onCloseAction,
  onDeleteAction,
}: {
  file?: StoredFile;
  pending: boolean;
  onCloseAction: () => void;
  onDeleteAction: (file: StoredFile) => void;
}) {
  // Kept while it closes, so it doesn't empty as it fades
  const [last, setLast] = useState(file);
  if (file && file !== last) setLast(file);
  const shown = file ?? last;
  const kind = shown && mediaKind(shown.key);
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent className='flex max-h-[90vh] flex-col gap-3 sm:max-w-3xl'>
        {shown && (
          <>
            <DialogHeader className='pr-8'>
              <DialogTitle className='truncate font-mono'>
                {nameOf(shown.key)}
              </DialogTitle>
              <DialogDescription className='tabular-nums'>
                {formatBytes(shown.size)} · written{' '}
                {formatMoment(shown.modified)}
              </DialogDescription>
            </DialogHeader>
            <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted'>
              {kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shown.url}
                  alt={nameOf(shown.key)}
                  className='max-h-[65vh] max-w-full object-contain'
                />
              ) : kind === 'video' ? (
                <video
                  src={shown.url}
                  controls
                  className='max-h-[65vh] max-w-full'
                />
              ) : kind === 'audio' ? (
                <audio src={shown.url} controls className='m-6 w-full' />
              ) : (
                <p className='p-6 text-muted-foreground'>
                  No preview for this kind of file.
                </p>
              )}
            </div>
            <p className='truncate font-mono text-muted-foreground'>
              {shown.key}
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='destructive'
                disabled={pending}
                onClick={() => onDeleteAction(shown)}
              >
                <Trash2Icon />
                Delete
              </Button>
              <Button variant='outline' className='ml-auto' asChild>
                <a href={shown.url} target='_blank' rel='noreferrer'>
                  <ExternalLinkIcon />
                  Open
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
