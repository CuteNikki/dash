'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArchiveRestoreIcon,
  DatabaseIcon,
  FolderIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';

import {
  addBackupFolder,
  removeBackupFolder,
  setBackupSource,
} from '@/actions/backups';
import { readRunStream } from '@/lib/docker/read-run-stream';
import { fetcher } from '@/lib/fetcher';
import { formatAgo, formatBytes, formatPast } from '@/lib/format';
import type { BackupSnapshots, BackupState } from '@/lib/types';
import { cn } from '@/lib/utils';

import { RunOutput } from '@/components/common/run-output';
import { TextSkeleton } from '@/components/common/skeletons';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type Source = BackupState['sources'][number];
type Snapshot = BackupSnapshots['snapshots'][number];

/**
 * The backups: when they run and where they're kept, each database and
 * folder with its last backup, switched on or off, and restored from any
 * of the backups kept; backing up now; and folders added from outside
 * ~/services.
 */
export function BackupsDialog({
  open,
  onCloseAction,
}: {
  open: boolean;
  onCloseAction: () => void;
}) {
  const { data, error, mutate } = useSWR<BackupState>(
    open ? '/api/backups' : null,
    fetcher,
    { refreshInterval: (d) => (d?.running ? 5_000 : 60_000) }
  );
  // Apart, as reading them takes restic a moment: the list shows meanwhile
  const {
    data: backups,
    error: backupsError,
    mutate: rereadBackups,
  } = useSWR<BackupSnapshots>(
    open && data && !data.off ? '/api/backups/snapshots' : null,
    fetcher,
    { refreshInterval: 60_000 }
  );
  // None while they're read; none at all, rather than read for ever, once
  // reading them has failed
  const snapshotsOf = (id: string) =>
    backupsError ? [] : backups?.snapshots.filter((s) => s.source === id);
  const readError = backups?.error ?? backupsError?.message;

  /** Switches a part on or off at once, then saves it. */
  async function toggle(source: Source, enabled: boolean) {
    void mutate(
      (d) =>
        d && {
          ...d,
          sources: d.sources.map((s) =>
            s.id === source.id ? { ...s, enabled } : s
          ),
        },
      { revalidate: false }
    );
    const { error } = await setBackupSource(source.id, enabled).catch(() => ({
      error: "The dashboard didn't answer",
    }));
    if (error) toast.error("Couldn't change that", { description: error });
    void mutate();
  }
  const [output, setOutput] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<Source>();

  /** Follows a backup or restore to its end, showing what it says. */
  async function follow(
    request: Promise<Response>,
    done: string,
    failed: string
  ) {
    setBusy(true);
    setOutput([]);
    try {
      const exit = await readRunStream(await request, (line) =>
        setOutput((lines) => [...(lines ?? []), line])
      );
      if (exit === 0) toast.success(done);
      else
        toast.error(failed, {
          description: 'See what restic said in the window',
        });
    } catch {
      toast.error(failed, { description: "The dashboard didn't answer" });
    } finally {
      setBusy(false);
      void mutate();
      void rereadBackups();
    }
  }

  const running = busy || !!data?.running;
  const databases = data?.sources.filter((s) => s.kind === 'postgres') ?? [];
  const folders = data?.sources.filter((s) => s.kind === 'folder') ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCloseAction()}>
      <DialogContent className='flex max-h-[90dvh] flex-col sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Backups</DialogTitle>
          <DialogDescription>
            {!data
              ? 'Looking at the backups…'
              : data.off
                ? data.off
                : [
                    `Every night at ${data.nightlyAt}, the last 7 of each kept`,
                    data.where === 'local'
                      ? 'in Garage on this server'
                      : 'off the server',
                    backups?.size !== undefined &&
                      `${formatBytes(backups.size)} in all`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
          </DialogDescription>
        </DialogHeader>

        <div className='-mx-1 flex min-h-0 flex-col gap-5 overflow-x-hidden overflow-y-auto px-1 pb-1'>
          {error && !data && (
            <p className='text-destructive'>{error.message}</p>
          )}
          {readError && (
            <p className='text-destructive'>
              Couldn&apos;t read the backups: {readError}
            </p>
          )}
          {data?.lastRun && (
            <LastRun run={data.lastRun} sources={data.sources} />
          )}

          {output && (
            <RunOutput lines={output} placeholder='Starting restic…' />
          )}

          {!data ? (
            <div className='flex flex-col gap-3'>
              <TextSkeleton className='w-64' />
              <TextSkeleton className='w-48' />
            </div>
          ) : (
            <>
              <Section title='Databases' icon={<DatabaseIcon />}>
                {databases.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    snapshots={snapshotsOf(s.id)}
                    disabled={running || !!data.off}
                    onRestoreAction={() => setRestoring(s)}
                    onToggleAction={(on) => void toggle(s, on)}
                    onChangedAction={() => void mutate()}
                  />
                ))}
              </Section>
              <Section title='Folders' icon={<FolderIcon />}>
                {folders.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    snapshots={snapshotsOf(s.id)}
                    disabled={running || !!data.off}
                    onRestoreAction={() => setRestoring(s)}
                    onToggleAction={(on) => void toggle(s, on)}
                    onChangedAction={() => void mutate()}
                  />
                ))}
              </Section>
              <AddFolder onAddedAction={() => void mutate()} />
            </>
          )}
        </div>

        <div className='flex justify-end'>
          <Button
            disabled={running || !data || !!data.off}
            onClick={() =>
              void follow(
                fetch('/api/backups', { method: 'POST' }),
                'Everything is backed up',
                "Some of it couldn't be backed up"
              )
            }
          >
            <RefreshCwIcon className={cn(running && 'animate-spin')} />
            {running ? 'Running…' : 'Back up now'}
          </Button>
        </div>
      </DialogContent>

      <RestoreDialog
        source={restoring}
        snapshots={restoring ? (snapshotsOf(restoring.id) ?? []) : []}
        onCloseAction={() => setRestoring(undefined)}
        onRestoreAction={(snapshot, when) => {
          const source = restoring!;
          setRestoring(undefined);
          void follow(
            fetch('/api/backups/restore', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                source: source.id,
                snapshot,
                label: when,
              }),
            }),
            `${source.label} is restored`,
            `${source.label} couldn't be restored`
          );
        }}
      />
    </Dialog>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className='flex flex-col gap-1'>
      <h3 className='flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground'>
        {icon}
        {title}
      </h3>
      <ul className='flex flex-col divide-y'>{children}</ul>
    </section>
  );
}

/** How the last run went: when, and which parts failed, if any did. */
function LastRun({
  run,
  sources,
}: {
  run: NonNullable<BackupState['lastRun']>;
  sources: Source[];
}) {
  const failed = run.results.filter((r) => !r.ok);
  const label = (id: string) => sources.find((s) => s.id === id)?.label ?? id;
  return (
    <div
      className={cn(
        'rounded-lg p-3',
        failed.length ? 'bg-destructive/10 text-destructive' : 'bg-muted'
      )}
    >
      <p>
        {!run.finishedAt
          ? `Running since ${formatPast(run.startedAt)}…`
          : failed.length
            ? `The last run, ${formatPast(run.startedAt)}, couldn't back up ${failed.length} of ${run.results.length}:`
            : `The last run, ${formatPast(run.startedAt)}, backed up all ${run.results.length}.`}
      </p>
      {failed.length > 0 && (
        <ul className='mt-1'>
          {failed.map((r) => (
            <li key={r.source}>
              {label(r.source)}: {r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A part: its last backup and how many are kept, on or off, and its restore. */
function SourceRow({
  source,
  snapshots,
  disabled,
  onRestoreAction,
  onToggleAction,
  onChangedAction,
}: {
  source: Source;
  /** Its backups, newest first; none while they're read */
  snapshots?: Snapshot[];
  disabled: boolean;
  onRestoreAction: () => void;
  onToggleAction: (on: boolean) => void;
  onChangedAction: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const kept = snapshots?.filter((s) => !s.beforeRestore) ?? [];
  const last = kept[0];
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span
          className={cn(
            'font-mono wrap-break-word',
            !source.enabled && 'text-muted-foreground'
          )}
        >
          {source.label}
        </span>
        <span className='text-muted-foreground'>
          {!source.enabled ? (
            'Switched off'
          ) : !snapshots ? (
            <TextSkeleton className='w-40' />
          ) : last ? (
            `Backed up ${formatAgo(last.at)}, ${kept.length} kept`
          ) : (
            'Not backed up yet'
          )}
        </span>
      </div>
      <Button
        variant='outline'
        size='sm'
        disabled={disabled || !snapshots?.length}
        onClick={onRestoreAction}
      >
        <ArchiveRestoreIcon />
        Restore…
      </Button>
      {source.added ? (
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={`Stop backing up ${source.label}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const { error } = await removeBackupFolder(source.id);
              if (error) toast.error(error);
              onChangedAction();
            })
          }
        >
          <XIcon />
        </Button>
      ) : (
        <Switch
          aria-label={`Back up ${source.label}`}
          checked={source.enabled}
          onCheckedChange={onToggleAction}
        />
      )}
    </li>
  );
}

/** A folder outside ~/services to back up too, by its path. */
function AddFolder({ onAddedAction }: { onAddedAction: () => void }) {
  const [path, setPath] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <form
      className='flex flex-col gap-2'
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const { error } = await addBackupFolder(path);
          if (error) {
            toast.error("Couldn't add it", { description: error });
            return;
          }
          setPath('');
          onAddedAction();
        });
      }}
    >
      <label htmlFor='backup-folder' className='text-muted-foreground'>
        A folder outside ~/services to back up too, as apps&apos; settings kept
        elsewhere
      </label>
      <div className='flex gap-2'>
        <Input
          id='backup-folder'
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder='/docker/config'
          className='min-w-0 flex-1 font-mono'
        />
        <Button
          type='submit'
          variant='outline'
          disabled={pending || !path.trim()}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
    </form>
  );
}

/** Picks which of a part's backups to put back, and says what that does first. */
function RestoreDialog({
  source,
  snapshots,
  onCloseAction,
  onRestoreAction,
}: {
  source?: Source;
  snapshots: Snapshot[];
  onCloseAction: () => void;
  onRestoreAction: (snapshot: string, when: string) => void;
}) {
  const [picked, setPicked] = useState<string>();
  const chosen = snapshots.find((s) => s.id === picked) ?? snapshots[0];
  const when = (s: { at: number; beforeRestore: boolean }) =>
    `${formatPast(s.at)}${s.beforeRestore ? ', before a restore' : ''}`;
  return (
    <AlertDialog
      open={!!source}
      onOpenChange={(o) => {
        if (!o) {
          setPicked(undefined);
          onCloseAction();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore {source?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {source?.kind === 'postgres'
              ? 'The database is put back as it was then, replacing what it holds now.'
              : "The folder's files are put back as they were then, and files it didn't have then are removed. Its services are stopped while it's restored, and started again after."}{' '}
            What&apos;s there now is backed up first, so this can be undone by
            restoring that.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {chosen && (
          <Select value={chosen.id} onValueChange={setPicked}>
            <SelectTrigger aria-label='Which backup'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {snapshots.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {when(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={!chosen}
            onClick={() => chosen && onRestoreAction(chosen.id, when(chosen))}
          >
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
