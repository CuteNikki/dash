'use client';

import { useTranslations } from 'next-intl';
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

import { useFormat } from '@/i18n/use-format';
import { useIssueText } from '@/i18n/use-issue-text';

import { readRunStream } from '@/lib/docker/read-run-stream';
import { fetcher } from '@/lib/fetcher';
import type { BackupSnapshots, BackupState } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Failure } from '@/components/common/failure';
import { RunOutput } from '@/components/common/run-output';
import { TextSkeleton } from '@/components/common/skeletons';
import { useKeptCount } from '@/components/common/use-kept';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  const issueText = useIssueText();
  const format = useFormat();
  const t = useTranslations('backups');
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
      error: t('noAnswer'),
    }));
    if (error) toast.error(t('changeFailed'), { description: error });
    void mutate();
  }
  const [output, setOutput] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<Source>();
  /** The part being backed up on its own, if one is */
  const [backingUp, setBackingUp] = useState<string>();

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
          description: t('seeRestic'),
        });
    } catch {
      toast.error(failed, { description: t('noAnswer') });
    } finally {
      setBusy(false);
      setBackingUp(undefined);
      void mutate();
      void rereadBackups();
    }
  }

  /** Backs up one part now, on its own. */
  function backUp(source: Source) {
    setBackingUp(source.id);
    void follow(
      fetch('/api/backups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: source.id }),
      }),
      t('backedUp', { name: source.label }),
      t('backUpFailed', { name: source.label })
    );
  }

  const running = busy || !!data?.running;
  const databases = data?.sources.filter((s) => s.kind === 'postgres');
  const folders = data?.sources.filter((s) => s.kind === 'folder');
  // While they're read, as many rows as last time, and the last run's box
  // if there was one, so nothing moves once they're in
  const databaseRows = useKeptCount('backups:databases', databases?.length, 3);
  const folderRows = useKeptCount('backups:folders', folders?.length, 8);
  // Folders added by hand come last, with a button to remove in place of a switch
  const addedRows = useKeptCount(
    'backups:added',
    folders?.filter((s) => s.added).length,
    0
  );
  const hadLastRun = useKeptCount(
    'backups:last-run',
    data && (data.lastRun ? 1 : 0),
    1
  );
  const placeholders = (n: number, added = 0) =>
    Array.from({ length: n }, (_, i) => (
      <SourceRow key={i} index={i} added={i >= n - added} />
    ));
  const row = (s: Source) => (
    <SourceRow
      key={s.id}
      source={s}
      snapshots={snapshotsOf(s.id)}
      disabled={running || !!data?.off}
      backingUp={backingUp === s.id}
      onBackUpAction={() => backUp(s)}
      onRestoreAction={() => setRestoring(s)}
      onToggleAction={(on) => void toggle(s, on)}
      onChangedAction={() => void mutate()}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCloseAction()}>
      <DialogContent
        className='flex max-h-[90dvh] flex-col sm:max-w-3xl'
        // Focus the window itself, not its first button, whose tooltip
        // would open with it; Tab still reaches every button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {!data
              ? t('looking')
              : data.off
                ? issueText(data.off)
                : [
                    t('nightly', { time: data.nightlyAt }),
                    data.where === 'local' ? t('local') : t('offServer'),
                    backups?.size !== undefined &&
                      t('inAll', { size: format.bytes(backups.size) }),
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
              {t('readFailed', { error: readError })}
            </p>
          )}
          {data?.lastRun ? (
            <LastRun run={data.lastRun} sources={data.sources} />
          ) : (
            !data &&
            !error &&
            hadLastRun > 0 && (
              <div className='rounded-lg bg-muted p-3'>
                <p>
                  <TextSkeleton className='w-96 max-w-full' />
                </p>
              </div>
            )
          )}

          {output && (
            <RunOutput lines={output} placeholder={t('startingRestic')} />
          )}

          {!(error && !data) && (
            <>
              <Section title={t('databases')} icon={<DatabaseIcon />}>
                {databases?.map(row) ?? placeholders(databaseRows)}
              </Section>
              <Section title={t('folders')} icon={<FolderIcon />}>
                {folders?.map(row) ?? placeholders(folderRows, addedRows)}
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
                t('allBackedUp'),
                t('someFailed')
              )
            }
          >
            <RefreshCwIcon
              className={cn(running && !backingUp && 'animate-spin')}
            />
            {running && !backingUp ? t('running') : t('backUpNow')}
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
            t('restored', { name: source.label }),
            t('restoreFailed', { name: source.label })
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
  const format = useFormat();
  const t = useTranslations('backups');
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
          ? t('runningSince', { when: format.past(run.startedAt) })
          : failed.length
            ? t('lastRunFailed', {
                when: format.past(run.startedAt),
                failed: failed.length,
                count: run.results.length,
              })
            : t('lastRunOk', {
                when: format.past(run.startedAt),
                count: run.results.length,
              })}
      </p>
      {failed.length > 0 && (
        <ul className='mt-1 flex flex-col gap-1'>
          {failed.map((r) => (
            <li key={r.source}>
              <Failure>{`${label(r.source)}${r.error ? `: ${r.error}` : ''}`}</Failure>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A part: its last backup and how many are kept, on or off, backing it up
 * now on its own, and its restore. Without one, the same row with
 * placeholders, while the parts are read.
 */
function SourceRow({
  source,
  index = 0,
  added = source?.added,
  snapshots,
  disabled = true,
  backingUp,
  onBackUpAction,
  onRestoreAction,
  onToggleAction,
  onChangedAction,
}: {
  source?: Source;
  /** A placeholder's place, for its name's length */
  index?: number;
  /** A placeholder for a folder added by hand */
  added?: boolean;
  /** Its backups, newest first; none while they're read */
  snapshots?: Snapshot[];
  disabled?: boolean;
  /** Being backed up on its own now */
  backingUp?: boolean;
  onBackUpAction?: () => void;
  onRestoreAction?: () => void;
  onToggleAction?: (on: boolean) => void;
  onChangedAction?: () => void;
}) {
  const format = useFormat();
  const t = useTranslations('backups');
  const [pending, startTransition] = useTransition();
  const kept = snapshots?.filter((s) => !s.beforeRestore) ?? [];
  const last = kept[0];
  const label = source?.label ?? t('aPart');
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span
          className={cn(
            'font-mono wrap-break-word',
            source && !source.enabled && 'text-muted-foreground'
          )}
        >
          {source?.label ?? (
            <TextSkeleton className={index % 2 ? 'w-40' : 'w-28'} />
          )}
        </span>
        <span className='text-muted-foreground'>
          {!source ? (
            <TextSkeleton className='w-48' />
          ) : !source.enabled ? (
            t('switchedOff')
          ) : !snapshots ? (
            <TextSkeleton className='w-40' />
          ) : last ? (
            t('lastBackup', { ago: format.ago(last.at), count: kept.length })
          ) : (
            t('notYet')
          )}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('backUpThisNow', { name: label })}
            disabled={disabled || !source?.enabled}
            onClick={onBackUpAction}
          >
            <RefreshCwIcon className={cn(backingUp && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('backUpNow')}</TooltipContent>
      </Tooltip>
      <Button
        variant='outline'
        size='sm'
        disabled={disabled || !snapshots?.length}
        onClick={onRestoreAction}
      >
        <ArchiveRestoreIcon />
        {t('restore')}
      </Button>
      {added ? (
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={t('stopBackingUp', { name: label })}
          disabled={pending || !source}
          onClick={() =>
            startTransition(async () => {
              if (!source) return;
              const { error } = await removeBackupFolder(source.id);
              if (error) toast.error(error);
              onChangedAction?.();
            })
          }
        >
          <XIcon />
        </Button>
      ) : (
        <Switch
          aria-label={t('backUpThis', { name: label })}
          checked={source?.enabled ?? true}
          disabled={!source}
          onCheckedChange={onToggleAction}
        />
      )}
    </li>
  );
}

/** A folder outside ~/services to back up too, by its path. */
function AddFolder({ onAddedAction }: { onAddedAction: () => void }) {
  const t = useTranslations('backups');
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
            toast.error(t('addFailed'), { description: error });
            return;
          }
          setPath('');
          onAddedAction();
        });
      }}
    >
      <label htmlFor='backup-folder' className='text-muted-foreground'>
        {t('addFolderHint')}
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
          {t('add')}
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
  const format = useFormat();
  const t = useTranslations('backups');
  const [picked, setPicked] = useState<string>();
  const chosen = snapshots.find((s) => s.id === picked) ?? snapshots[0];
  const when = (s: { at: number; beforeRestore: boolean }) =>
    s.beforeRestore
      ? t('beforeRestore', { when: format.past(s.at) })
      : format.past(s.at);
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
          <AlertDialogTitle>
            {t('restoreTitle', { name: source?.label ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {source?.kind === 'postgres'
              ? t('restoreDatabase')
              : t('restoreFolder')}{' '}
            {t('restoreUndo')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {chosen && (
          <Select value={chosen.id} onValueChange={setPicked}>
            <SelectTrigger aria-label={t('whichBackup')}>
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
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={!chosen}
            onClick={() => chosen && onRestoreAction(chosen.id, when(chosen))}
          >
            {t('restore')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
