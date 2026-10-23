'use client';

import useSWR from 'swr';

import {
  ArchiveIcon,
  BellIcon,
  CheckCircle2Icon,
  GlobeIcon,
  HardDriveIcon,
  LockIcon,
  ServerCrashIcon,
} from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import { formatDuration, formatPast } from '@/lib/format';
import type { AlertView } from '@/lib/types';
import { cn } from '@/lib/utils';

import { TextSkeleton } from '@/components/common/skeletons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const KIND_ICONS: Record<AlertView['kind'], React.ReactNode> = {
  service: <ServerCrashIcon />,
  disk: <HardDriveIcon />,
  site: <GlobeIcon />,
  cert: <LockIcon />,
  backup: <ArchiveIcon />,
};

/** The header's bell: how many things are wrong now, red while any are. */
export function AlertsButton({
  open,
  onClickAction,
}: {
  /** What's wrong now */
  open: AlertView[];
  onClickAction: () => void;
}) {
  const count = open.length;
  return (
    <Button
      variant='outline'
      aria-label={count ? `Alerts, ${count} open` : 'Alerts'}
      onClick={onClickAction}
      className={cn(count > 0 && 'text-destructive hover:text-destructive')}
    >
      <BellIcon />
      {count > 0 && <span className='font-mono tabular-nums'>{count}</span>}
    </Button>
  );
}

/**
 * What the monitor finds wrong now, and what was wrong lately: services
 * down, the disk filling, websites not answering, certificates running out,
 * backups failing.
 */
export function AlertsDialog({
  open,
  mail,
  onCloseAction,
}: {
  open: boolean;
  /** The dashboard can send mail, so alerts are mailed too */
  mail: boolean;
  onCloseAction: () => void;
}) {
  const { data, error } = useSWR<{
    open: AlertView[];
    over: AlertView[];
    at: number;
  }>(open ? '/api/alerts' : null, fetcher, { refreshInterval: 30_000 });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCloseAction()}>
      <DialogContent className='flex max-h-[85dvh] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Alerts</DialogTitle>
          <DialogDescription>
            {mail
              ? 'Checked every minute, and mailed to owners and admins once something has been wrong for two minutes, and again once it is right.'
              : "Checked every minute. Mail isn't set up, so they only show here."}
          </DialogDescription>
        </DialogHeader>
        <div className='-mx-1 flex flex-col gap-6 overflow-y-auto px-1'>
          {error && !data ? (
            <p className='text-destructive'>{error.message}</p>
          ) : !data ? (
            <TextSkeleton className='w-64' />
          ) : (
            <>
              <section className='flex flex-col gap-2'>
                <h3 className='font-medium'>Now</h3>
                {data.open.length ? (
                  <ul className='flex flex-col divide-y'>
                    {data.open.map((a) => (
                      <AlertRow key={a.id} alert={a} now={data.at} />
                    ))}
                  </ul>
                ) : (
                  <p className='flex items-center gap-2 text-muted-foreground [&_svg]:size-4'>
                    <CheckCircle2Icon className='text-success' />
                    Nothing&apos;s wrong.
                  </p>
                )}
              </section>
              {data.over.length > 0 && (
                <section className='flex flex-col gap-2'>
                  <h3 className='font-medium'>Lately</h3>
                  <ul className='flex flex-col divide-y'>
                    {data.over.map((a) => (
                      <AlertRow key={a.id} alert={a} now={data.at} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One alert: what it's about, what's wrong, since when and for how long, as of `now`. */
function AlertRow({ alert, now }: { alert: AlertView; now: number }) {
  const end = alert.resolvedAt ?? now;
  const lasted = formatDuration((end - alert.since) / 1000);
  return (
    <li className='flex items-start gap-3 py-2'>
      <span
        className={cn(
          'mt-0.5 [&_svg]:size-4',
          alert.resolvedAt ? 'text-muted-foreground' : 'text-destructive'
        )}
      >
        {KIND_ICONS[alert.kind]}
      </span>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='wrap-break-word'>
          <span className='font-medium'>{alert.subject}</span>{' '}
          <span className={cn(!alert.resolvedAt && 'text-destructive')}>
            {alert.message}
          </span>
        </span>
        <span className='text-muted-foreground'>
          {alert.resolvedAt
            ? `${formatPast(alert.since)}, for ${lasted}`
            : `Since ${formatPast(alert.since)}, ${lasted} so far`}
          {alert.mailed && ' · mailed'}
        </span>
      </div>
    </li>
  );
}
