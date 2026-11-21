'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  ArrowUpCircleIcon,
  CircleCheckIcon,
  LoaderIcon,
  PlayIcon,
  RotateCwIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import { runContainerAction } from '@/actions/containers';

import { healthOf, labelOf } from '@/lib/dashboard/status';
import type { ContainerAction } from '@/lib/docker/docker';
import type { AlertView, Service, SystemUpdates } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useCan } from '@/components/common/role';
import { attempt } from '@/components/common/toasts';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill } from '@/components/service/status-dot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Trouble = 'stopped' | 'offline' | 'attention';

/** What needs a look: a stopped container or offline website, or one that's struggling. */
function troubleOf(service: Service): Trouble | null {
  if (service.site) return labelOf(service) === 'offline' ? 'offline' : null;
  const health = healthOf(service.state);
  return health === 'off'
    ? 'stopped'
    : health === 'attention'
      ? 'attention'
      : null;
}

/** The services that need a look, the stopped and offline ones first: they're down, the rest only struggling. */
export function troubledOf(services: Service[]) {
  return services
    .map((service) => ({ service, trouble: troubleOf(service) }))
    .filter((t): t is { service: Service; trouble: Trouble } => !!t.trouble)
    .sort(
      (a, b) =>
        Number(a.trouble === 'attention') - Number(b.trouble === 'attention')
    );
}

/**
 * The answer to "is everything fine?", in one line beside the dashboard's
 * name: everything's running, or what's wrong, counted.
 */
export function VerdictLine({
  services,
  alerts,
  system,
  className,
}: {
  /** The services shown on the board, hidden ones left out */
  services: Service[];
  /** What the monitor finds wrong now, for those who see the server */
  alerts?: AlertView[];
  system?: SystemUpdates;
  className?: string;
}) {
  const t = useTranslations('verdict');
  const troubled = troubledOf(services);
  const count = (trouble: Trouble) =>
    troubled.filter((t) => t.trouble === trouble).length;
  const stopped = count('stopped');
  const offline = count('offline');
  const attention = count('attention');
  const updates = services.filter((s) => s.update).length;
  const systemUpdates = system?.packages.length ?? 0;
  // Alerts about the server rather than a service: a full disk, a certificate, a backup
  const otherAlerts = (alerts ?? []).filter((a) => a.kind !== 'service').length;
  const running = services.length - stopped - offline;

  const problems = [
    stopped && t('stopped', { count: stopped }),
    offline && t('offline', { count: offline }),
    attention && t('attention', { count: attention }),
    updates && t('updates', { count: updates }),
    otherAlerts && t('alerts', { count: otherAlerts }),
  ].filter(Boolean);
  const down = stopped + offline > 0;
  const fine = !problems.length;
  const details = [
    t('running', { running, total: services.length }),
    systemUpdates
      ? t('systemUpdates', { count: systemUpdates })
      : !updates && t('upToDate'),
  ].filter(Boolean);

  const Icon = fine
    ? CircleCheckIcon
    : down || attention
      ? TriangleAlertIcon
      : ArrowUpCircleIcon;

  return (
    <p
      aria-label={t('label')}
      className={cn('flex min-w-0 items-center gap-2', className)}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-4',
          fine
            ? 'text-success'
            : down
              ? 'text-destructive'
              : attention
                ? 'text-warning'
                : 'text-update'
        )}
      />
      <span className='truncate'>
        <span className='font-medium'>
          {fine ? t('fine') : problems.join(', ')}
        </span>
        <span className='text-muted-foreground max-sm:hidden'>
          {' · '}
          {details.join(' · ')}
        </span>
      </span>
    </p>
  );
}

/** Docker's status without its "(unhealthy)": the pill beside it says so already. */
function withoutHealth(status: string) {
  return status.replace(/\s*\((unhealthy|healthy|health: starting)\)/, '');
}

/** Each service that needs a look, with the way to fix it beside it; nothing when none does. */
export function TroubleRows({
  services,
  onOpenAction,
  onLogsAction,
  onChangedAction,
}: {
  services: Service[];
  onOpenAction: (service: Service) => void;
  onLogsAction: (service: Service) => void;
  onChangedAction: () => unknown;
}) {
  const t = useTranslations('verdict');
  const ta = useTranslations('actions');
  const may = useCan();
  // What's being done to each, by key, until it's done
  const [busy, setBusy] = useState<Record<string, ContainerAction>>({});
  const troubled = troubledOf(services);
  if (!troubled.length) return null;

  function run(service: Service, action: ContainerAction) {
    setBusy((b) => ({ ...b, [service.key]: action }));
    const failed = ta('failed', { action, name: service.name });
    void attempt(failed, async () => {
      const result = await runContainerAction(service.containerId, action);
      if (result.ok) toast.success(ta('done', { action, name: service.name }));
      else toast.error(failed, { description: result.error });
      await onChangedAction();
    }).finally(() =>
      setBusy((b) => {
        const rest = { ...b };
        delete rest[service.key];
        return rest;
      })
    );
  }

  return (
    <Card
      size='sm'
      aria-label={t('rows')}
      className='gap-0 overflow-hidden py-0'
    >
      {troubled.map(({ service, trouble }) => {
        const action = trouble === 'stopped' ? 'start' : 'restart';
        const doing = busy[service.key];
        return (
          // A row opens the service's window; its buttons do what they say
          <div
            key={service.key}
            className={cn(
              // On a phone, its buttons on a line of their own, so the name keeps its room
              'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0',
              trouble !== 'attention' && 'bg-destructive/5'
            )}
          >
            <button
              type='button'
              onClick={() => onOpenAction(service)}
              aria-label={t('open', { name: service.name })}
              className='flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:underline'
            >
              <ServiceIcon
                icon={service.icon}
                variants={service.iconVariants}
                missing={service.iconMissing}
                name={service.name}
              />
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-sm font-medium'>
                    {service.name}
                  </span>
                  <StatePill
                    state={service.state}
                    label={labelOf(service)}
                    className='px-1.5 py-0 text-2xs'
                  />
                </div>
                <div className='truncate text-muted-foreground'>
                  {service.site
                    ? service.addresses[0]
                    : withoutHealth(service.status)}
                </div>
              </div>
            </button>
            {!service.site && (
              <div className='flex gap-2 max-sm:w-full max-sm:*:flex-1'>
                <Button
                  variant='outline'
                  onClick={() => onLogsAction(service)}
                  aria-label={t('logsOf', { name: service.name })}
                >
                  <ScrollTextIcon />
                  {t('logs')}
                </Button>
                {may('control') && (
                  <Button
                    variant={action === 'start' ? 'default' : 'outline'}
                    disabled={!!doing}
                    onClick={() => run(service, action)}
                  >
                    {doing ? (
                      <LoaderIcon className='animate-spin' />
                    ) : action === 'start' ? (
                      <PlayIcon />
                    ) : (
                      <RotateCwIcon />
                    )}
                    {t(action)}
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
