'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { LockIcon, SquareIcon, ZapIcon } from 'lucide-react';

import { stopProcess } from '@/actions/processes';

import { useFormat } from '@/i18n/use-format';

import { fetcher } from '@/lib/fetcher';
import type { HostProcess, ProcessDetails, Service } from '@/lib/types';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { ServiceIcon } from '@/components/service/service-icon';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * One of the server's processes, looked at closely: how it was started, who
 * runs it, since when, and its container. It can be stopped from here,
 * after asking, unless the server depends on it; one that won't stop when
 * asked can then be forced.
 */
export function ProcessDialog({
  process,
  services,
  onOpenServiceAction,
  onCloseAction,
}: {
  /** As the list last measured it, for its CPU; none closes the dialog */
  process?: HostProcess;
  services: Service[];
  onOpenServiceAction: (service: Service) => void;
  onCloseAction: () => void;
}) {
  return (
    <Dialog
      open={process !== undefined}
      onOpenChange={(o) => !o && onCloseAction()}
    >
      <DialogContent className='sm:max-w-2xl'>
        {process && (
          // Keyed, so another process starts afresh rather than as this one ended
          <Details
            key={process.pid}
            process={process}
            services={services}
            onOpenService={onOpenServiceAction}
            onClose={onCloseAction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Details({
  process,
  services,
  onOpenService,
  onClose,
}: {
  process: HostProcess;
  services: Service[];
  onOpenService: (service: Service) => void;
  onClose: () => void;
}) {
  const format = useFormat();
  const t = useTranslations('process');
  const { data, error, mutate } = useSWR<ProcessDetails>(
    `/api/processes/${process.pid}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [confirming, setConfirming] = useState(false);
  // Set once asking hasn't stopped it, offering to force it
  const [stubborn, setStubborn] = useState<string>();
  const [pending, startTransition] = useTransition();
  const service = services.find((s) => s.containerId === data?.containerId);

  function stop(force: boolean) {
    if (!data) return;
    startTransition(() =>
      attempt(t('stopFailed', { name: data.name }), async () => {
        const result = await stopProcess(data.pid, data.start, force);
        if (result.ok) {
          toast.success(
            result.outcome === 'gone'
              ? t('alreadyEnded', { name: data.name })
              : t('stopped', { name: data.name })
          );
          onClose();
        } else if (result.outcome === 'running') {
          setStubborn(result.error);
        } else {
          toast.error(t('stopFailed', { name: data.name }), {
            description: result.error,
          });
          if (result.outcome === 'replaced') onClose();
          else await mutate();
        }
        setConfirming(false);
      })
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className='font-mono'>
          {process.name}
          <span className='ml-2 font-normal text-muted-foreground'>
            {process.pid}
          </span>
        </DialogTitle>
        <DialogDescription className='sr-only'>
          {t('description')}
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <p className='text-muted-foreground'>{error.message}</p>
      ) : !data ? (
        <DetailsSkeleton />
      ) : (
        <div className='flex min-w-0 flex-col gap-4'>
          {data.command && <pre className={COMMAND}>{data.command}</pre>}
          <dl className={DETAILS}>
            <Detail label={t('labels.user')}>{data.user}</Detail>
            <Detail label={t('labels.runningFor')}>
              <span
                title={new Date(data.startedAt).toLocaleString(format.locale)}
              >
                {format.duration(data.runningFor)}
              </span>
            </Detail>
            <Detail label={t('labels.state')}>{data.state}</Detail>
            <Detail label={t('labels.cpu')}>{format.cpu(process.cpu)}</Detail>
            <Detail label={t('labels.memory')}>
              {format.bytes(data.memory)}
            </Detail>
            <Detail label={t('labels.threads')}>{data.threads}</Detail>
            <Detail label={t('labels.parent')}>{data.parentPid}</Detail>
            <Detail label={t('labels.container')}>
              {service ? (
                <button
                  type='button'
                  onClick={() => {
                    onClose();
                    onOpenService(service);
                  }}
                  className='flex max-w-full items-center gap-1.5 hover:underline'
                >
                  <ServiceIcon
                    icon={service.icon}
                    name={service.name}
                    variants={service.iconVariants}
                    missing={service.iconMissing}
                    className='size-3.5 shrink-0'
                  />
                  <span className='truncate'>{service.name}</span>
                </button>
              ) : data.containerId ? (
                <span className='font-mono'>
                  {data.containerId.slice(0, 12)}
                </span>
              ) : (
                t('onServer')
              )}
            </Detail>
          </dl>
          {data.containerMain && (
            <p className='text-muted-foreground'>{t('containerMain')}</p>
          )}
          {stubborn && (
            <p role='alert' className='text-warning'>
              {stubborn}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        {data?.locked ? (
          // As tall as the Stop button it stands in place of, so the
          // dialog's the same height whichever it shows
          <p className='mr-auto flex min-h-7 items-center gap-2 text-muted-foreground'>
            <LockIcon className='size-3.5 shrink-0' />
            {data.locked}
          </p>
        ) : stubborn ? (
          <Button
            variant='destructive'
            disabled={pending}
            onClick={() => stop(true)}
          >
            <ZapIcon />
            {t('forceStop')}
          </Button>
        ) : (
          <Button
            variant='destructive'
            disabled={!data || pending}
            onClick={() => setConfirming(true)}
          >
            <SquareIcon />
            {pending ? t('stopping') : t('stop')}
          </Button>
        )}
      </DialogFooter>

      <AlertDialog
        open={confirming}
        onOpenChange={(o) => !pending && setConfirming(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('stopTitle', {
                name: data?.name ?? '',
                pid: `${data?.pid ?? ''}`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {data?.containerMain && service
                ? t('stopsWith', { name: service.name })
                : service
                  ? t('runsIn', { name: service.name })
                  : ''}
              {t('askedToStop')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={pending}
              onClick={(e) => {
                // Stays open until it's done, to show it's happening
                e.preventDefault();
                stop(false);
              }}
            >
              <SquareIcon />
              {pending ? t('stopping') : t('stop')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-w-0 flex-col'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='truncate'>{children}</dd>
    </div>
  );
}

/** The box a process's command shows in, and its placeholder's */
const COMMAND =
  'max-h-32 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed break-all whitespace-pre-wrap select-all';
/** The grid of what it is, and its placeholder's */
const DETAILS = 'grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3';
/** The details' labels, in the order they show, by their keys under "process.labels" */
const LABELS = [
  'user',
  'runningFor',
  'state',
  'cpu',
  'memory',
  'threads',
  'parent',
  'container',
] as const;

/** The details while they're looked up: the same box and grid, values to come. */
function DetailsSkeleton() {
  const t = useTranslations('process');
  return (
    <div
      aria-busy
      role='status'
      aria-label={t('loading')}
      className='flex min-w-0 flex-col gap-4'
    >
      <pre className={COMMAND}>
        <TextSkeleton className='w-2/3' />
      </pre>
      <dl className={DETAILS}>
        {LABELS.map((label) => (
          <Detail key={label} label={t(`labels.${label}`)}>
            <TextSkeleton className='w-16' />
          </Detail>
        ))}
      </dl>
    </div>
  );
}
