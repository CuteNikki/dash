'use client';

import { useTranslations } from 'next-intl';
import useSWR from 'swr';

import {
  ArchiveIcon,
  BellIcon,
  CheckCircle2Icon,
  GlobeIcon,
  HardDriveIcon,
  LockIcon,
  MailCheckIcon,
  ServerCrashIcon,
} from 'lucide-react';

import { useFormat } from '@/i18n/use-format';

import { fetcher } from '@/lib/fetcher';
import type { AlertView } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ButtonCount } from '@/components/common/button-count';
import { TextSkeleton } from '@/components/common/skeletons';
import { useKeptCount } from '@/components/common/use-kept';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

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
  className,
}: {
  /** What's wrong now */
  open: AlertView[];
  onClickAction: () => void;
  className?: string;
}) {
  const t = useTranslations('alerts');
  const count = open.length;
  return (
    <Button
      variant='outline'
      aria-label={count ? t('openCount', { count }) : t('title')}
      onClick={onClickAction}
      className={cn(
        'relative',
        count > 0 && 'text-destructive hover:text-destructive',
        className
      )}
    >
      <BellIcon />
      {count > 0 && <ButtonCount count={count} tone='destructive' />}
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
  const t = useTranslations('alerts');
  const { data, error } = useSWR<{
    open: AlertView[];
    over: AlertView[];
    at: number;
  }>(open ? '/api/alerts' : null, fetcher, { refreshInterval: 30_000 });
  // While they're read, as many rows as there were last time
  const nowRows = useKeptCount('alerts:open', data?.open.length, 0);
  const overRows = useKeptCount('alerts:over', data?.over.length, 3);
  const placeholders = (n: number) =>
    Array.from({ length: n }, (_, i) => <AlertRow key={i} index={i} />);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCloseAction()}>
      <DialogContent className='flex max-h-[85dvh] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {mail ? t('descriptionMail') : t('descriptionNoMail')}
          </DialogDescription>
        </DialogHeader>
        <div className='-mx-1 flex flex-col gap-6 overflow-y-auto px-1'>
          {error && !data ? (
            <p className='text-destructive'>{error.message}</p>
          ) : (
            <>
              <section className='flex flex-col gap-2'>
                <h3 className='font-medium'>{t('now')}</h3>
                {nowRows ? (
                  <ul className='flex flex-col divide-y'>
                    {data
                      ? data.open.map((a) => (
                          <AlertRow key={a.id} alert={a} now={data.at} />
                        ))
                      : placeholders(nowRows)}
                  </ul>
                ) : (
                  <p className='flex items-center gap-2 text-muted-foreground [&_svg]:size-4'>
                    <CheckCircle2Icon className='text-success' />
                    {t('nothingWrong')}
                  </p>
                )}
              </section>
              {overRows > 0 && (
                <section className='flex flex-col gap-2'>
                  <h3 className='font-medium'>{t('lately')}</h3>
                  <ul className='flex flex-col divide-y'>
                    {data
                      ? data.over.map((a) => (
                          <AlertRow key={a.id} alert={a} now={data.at} />
                        ))
                      : placeholders(overRows)}
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

/**
 * One alert: what it's about, what's wrong, since when and for how long, as
 * of `now`. Without one, the same row with placeholders, while they're read.
 */
function AlertRow({
  alert,
  now = 0,
  index = 0,
}: {
  alert?: AlertView;
  now?: number;
  /** A placeholder's place, for its lines' lengths */
  index?: number;
}) {
  const format = useFormat();
  const t = useTranslations('alerts');
  if (!alert) {
    return (
      <li className='flex items-center gap-3 py-2.5 max-sm:items-start max-sm:gap-2.5'>
        <Skeleton className='size-9 shrink-0 bg-foreground/10 max-sm:size-6 max-sm:rounded-sm' />
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <TextSkeleton className={index % 2 ? 'w-52' : 'w-40'} />
          <TextSkeleton className={index % 2 ? 'w-64' : 'w-80 max-w-full'} />
          <TextSkeleton className='w-36' />
          <span className='sm:hidden'>
            <TextSkeleton className='w-12' />
          </span>
        </div>
      </li>
    );
  }
  const end = alert.resolvedAt ?? now;
  const lasted = format.duration((end - alert.since) / 1000);
  return (
    <li className='flex items-center gap-3 py-2.5 max-sm:items-start max-sm:gap-2.5'>
      {/* Its kind, in a square of its own beside all three lines, red while
          it's open; on a phone, a small one by the name, for the text's room */}
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md max-sm:size-6 max-sm:rounded-sm [&_svg]:size-4 max-sm:[&_svg]:size-3.5',
          alert.resolvedAt
            ? 'bg-muted text-muted-foreground'
            : 'bg-destructive/10 text-destructive'
        )}
      >
        {KIND_ICONS[alert.kind]}
      </span>
      {/* What it's about, with how long it's lasted beside it, then what's
          wrong under it, then since when and whether it was mailed */}
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='flex items-baseline justify-between gap-3'>
          {/* Whole, on two lines if it must: it's what the alert's about */}
          <span className='min-w-0 font-medium wrap-break-word'>
            {alert.subject}
          </span>
          {/* On a phone, on a line of its own at the end, so the name has
              this one, and an envelope in its place if it was mailed */}
          <span className='shrink-0 font-mono text-muted-foreground tabular-nums max-sm:hidden'>
            {alert.resolvedAt ? lasted : t('soFar', { duration: lasted })}
          </span>
          {alert.mailed && (
            <MailCheckIcon
              aria-label={t('mailed')}
              className='size-3.5 shrink-0 self-center text-muted-foreground sm:hidden'
            />
          )}
        </span>
        <span
          className={cn(
            'wrap-break-word',
            alert.resolvedAt ? 'text-muted-foreground' : 'text-destructive'
          )}
        >
          {alert.message}
        </span>
        <span className='text-muted-foreground'>
          {alert.resolvedAt
            ? t('fromTo', {
                from: capitalized(format.past(alert.since)),
                to: sameDay(alert.since, alert.resolvedAt)
                  ? format.time(alert.resolvedAt)
                  : format.past(alert.resolvedAt),
              })
            : t('since', { when: format.past(alert.since) })}
          {alert.mailed && (
            <span className='max-sm:hidden'> · {t('mailed')}</span>
          )}
        </span>
        <span className='font-mono text-muted-foreground tabular-nums sm:hidden'>
          {alert.resolvedAt ? lasted : t('soFar', { duration: lasted })}
        </span>
      </div>
    </li>
  );
}

/** Whether two moments fall on the same day, in the viewer's own time. */
const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** Text as a line starts: "today 01:21 PM" → "Today 01:21 PM". */
const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
