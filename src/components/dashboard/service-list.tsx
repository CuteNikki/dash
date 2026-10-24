'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  ExternalLinkIcon,
  EyeOffIcon,
  PlayIcon,
  RotateCwIcon,
  ScrollTextIcon,
  SquareIcon,
} from 'lucide-react';

import { runContainerAction } from '@/actions/containers';
import type { ServiceGroup } from '@/lib/dashboard/groups';
import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { ListFilter } from '@/lib/dashboard/view';
import type { ContainerAction } from '@/lib/docker/docker';
import { formatBytes, formatCpu, formatMs, MEASURES } from '@/lib/format';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Sparkline } from '@/components/charts/sparkline';
import { WidgetStats, widgetStats } from '@/components/charts/widget-stats';
import { useCan } from '@/components/common/role';
import { attempt } from '@/components/common/toasts';
import { addressWords } from '@/components/service/address-text';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill, StatusDot } from '@/components/service/status-dot';
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
import { UpdateBadge } from '@/components/updates/update-badge';

const DONE: Record<ContainerAction, string> = {
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
};

/**
 * Every service as a row of one table, under its group's name: what it is,
 * how it is, what it uses, where its stack is, and buttons for its logs and
 * to restart, stop or start it. Beside it, the groups to show one of, and
 * the stopped ones; above it on a phone. A row opens what a tile does.
 */
export function ServiceList({
  groups,
  filter: picked,
  onFilterAction,
  editing,
  onOpenAction,
  onLogsAction,
  onChangedAction,
}: {
  groups: ServiceGroup[];
  filter: ListFilter;
  onFilterAction: (filter: ListFilter) => void;
  editing: boolean;
  onOpenAction: (service: Service) => void;
  onLogsAction: (service: Service) => void;
  /** After an action, so the dashboard refreshes right away */
  onChangedAction: () => void;
}) {
  // A group since renamed or emptied shows them all
  const filter: ListFilter =
    picked.kind === 'group' && !groups.some((g) => g.name === picked.name)
      ? { kind: 'all' }
      : picked;
  const [stopping, setStopping] = useState<Service>();
  const [, startTransition] = useTransition();

  const all = groups.flatMap((g) => g.services);
  const stopped = all.filter((s) => !isRunning(s.state));
  const shown = groups
    .filter((g) => filter.kind !== 'group' || g.name === filter.name)
    .map((g) => ({
      ...g,
      services:
        filter.kind === 'stopped'
          ? g.services.filter((s) => !isRunning(s.state))
          : g.services,
    }))
    .filter((g) => g.services.length);

  function run(service: Service, action: ContainerAction) {
    startTransition(() =>
      attempt(`Couldn't ${action} ${service.name}`, async () => {
        const result = await runContainerAction(service.containerId, action);
        if (result.ok) toast.success(`${DONE[action]} ${service.name}`);
        else
          toast.error(`Couldn't ${action} ${service.name}`, {
            description: result.error,
          });
        onChangedAction();
      })
    );
  }

  const same = (f: ListFilter) =>
    f.kind === filter.kind &&
    (f.kind !== 'group' || filter.kind !== 'group' || f.name === filter.name);

  return (
    <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
      <nav
        aria-label='Show'
        // A row of chips, swiped edge to edge without a scrollbar, until
        // there's room for a column beside the table
        className='-mx-4 flex scrollbar-none gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-6 lg:mx-0 lg:w-44 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0'
      >
        <FilterItem
          label='All'
          count={all.length}
          active={same({ kind: 'all' })}
          onPick={() => onFilterAction({ kind: 'all' })}
        />
        {groups.map((g) => (
          <FilterItem
            key={g.name}
            label={g.name}
            count={g.services.length}
            active={same({ kind: 'group', name: g.name })}
            onPick={() => onFilterAction({ kind: 'group', name: g.name })}
          />
        ))}
        <div className='mx-1 my-0 w-px shrink-0 bg-border lg:mx-0 lg:my-2 lg:h-px lg:w-auto' />
        <FilterItem
          label='Stopped'
          count={stopped.length}
          active={same({ kind: 'stopped' })}
          onPick={() => onFilterAction({ kind: 'stopped' })}
        />
      </nav>

      <div className='min-w-0 flex-1 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10'>
        {/* Fixed columns, sized by the headings, each hidden with its column where there's no room */}
        <table className='w-full table-fixed text-xs'>
          <thead className='text-left font-medium tracking-wide text-muted-foreground uppercase'>
            <tr className='border-b'>
              <th className='px-3 py-2.5 font-medium'>Service</th>
              <th className='hidden w-28 px-2 py-2.5 font-medium sm:table-cell'>
                Status
              </th>
              <th className='w-14 px-2 py-2.5 font-medium sm:w-16 lg:w-36'>
                CPU
              </th>
              <th className='w-18 px-2 py-2.5 font-medium sm:w-20'>Memory</th>
              <th className='hidden w-[22%] px-2 py-2.5 font-medium xl:table-cell'>
                Stack
              </th>
              <th className='hidden w-28 px-3 py-2.5 text-right font-medium sm:table-cell'>
                Actions
              </th>
            </tr>
          </thead>
          {shown.map((group) => (
            <tbody key={group.name}>
              <tr className='border-b bg-muted/30'>
                {/* A cell for each column, hidden with it, rather than one
                    spanning them all, which would keep the hidden ones' room */}
                <th
                  scope='colgroup'
                  className='truncate px-3 py-1.5 text-left font-medium tracking-wide text-muted-foreground uppercase'
                >
                  {group.name}
                </th>
                <td className='hidden sm:table-cell' />
                <td />
                <td />
                <td className='hidden xl:table-cell' />
                <td className='hidden sm:table-cell' />
              </tr>
              {group.services.map((service) => (
                <Row
                  key={service.key}
                  service={service}
                  editing={editing}
                  onOpen={onOpenAction}
                  onLogs={onLogsAction}
                  onRun={(action) =>
                    action === 'stop'
                      ? setStopping(service)
                      : run(service, action)
                  }
                />
              ))}
            </tbody>
          ))}
        </table>
        {!shown.length && (
          <p className='px-3 py-6 text-center text-muted-foreground'>
            Nothing&apos;s stopped.
          </p>
        )}
      </div>

      <AlertDialog
        open={!!stopping}
        onOpenChange={(open) => !open && setStopping(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop {stopping?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays stopped until you start it again, including after the
              server restarts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => stopping && run(stopping, 'stop')}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterItem({
  label,
  count,
  active,
  onPick,
}: {
  label: string;
  count: number;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        'flex shrink-0 items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:justify-between',
        // Picked: its color and outline, not its weight, so it's no wider;
        // the outline inside it, which the swiped row of chips would cut off
        active && 'bg-card text-foreground ring-1 ring-foreground/10 ring-inset'
      )}
    >
      <span className='truncate'>{label}</span>
      <span className='font-mono text-xs text-muted-foreground tabular-nums'>
        {count}
      </span>
    </button>
  );
}

/** "/home/nikki/services/ludo" as "~/services/ludo". */
function shortPath(dir: string) {
  return dir.replace(/^\/home\/[^/]+/, '~');
}

function Row({
  service,
  editing,
  onOpen,
  onLogs,
  onRun,
}: {
  service: Service;
  editing: boolean;
  onOpen: (service: Service) => void;
  onLogs: (service: Service) => void;
  onRun: (action: ContainerAction) => void;
}) {
  const running = isRunning(service.state);
  // Starting and stopping is for those whose role may
  const controls = useCan()('control');
  const usage = running ? service.usage : undefined;
  // A website's response time, in place of a container's CPU
  const check = service.site?.check;
  const stats = widgetStats(service);
  const address = service.addresses[0];
  // Under its name: what it is, or where to reach it, or its container
  const detail =
    service.description ??
    (address ? addressWords(address) : service.containerName);

  return (
    <tr
      tabIndex={0}
      aria-label={editing ? `Edit ${service.name}` : service.name}
      data-hidden={service.hidden}
      onClick={() => onOpen(service)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(service);
        }
      }}
      className='cursor-pointer border-b outline-none last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[hidden=true]:*:opacity-60'
    >
      <td className='px-3 py-2.5'>
        <div className='flex items-center gap-3'>
          {/* None on the narrowest phones, to give its name and numbers
              the room; its state and update go before its name there */}
          <span className='relative flex shrink-0 max-xs:hidden'>
            <ServiceIcon
              icon={service.icon}
              variants={service.iconVariants}
              missing={service.iconMissing}
              name={service.name}
            />
            {/* Its state on its icon's corner, where there's no column for
                it, ringed in the table's color to stand off the icon */}
            <StatusDot
              state={service.state}
              className='absolute -right-0.5 -bottom-0.5 size-2.5 ring-2 ring-card sm:hidden'
            />
            {/* An update waiting on its other corner, so the name keeps its room */}
            {service.update && (
              <UpdateBadge
                update={service.update}
                corner
                className='absolute -top-1 -right-1'
              />
            )}
          </span>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <StatusDot
                state={service.state}
                className='hidden size-2 shrink-0 max-xs:block'
              />
              {service.update && (
                <UpdateBadge
                  update={service.update}
                  className='hidden max-xs:block'
                />
              )}
              <span className='truncate text-sm font-medium'>
                {service.name}
              </span>
              {service.hidden && (
                <EyeOffIcon
                  aria-label='Hidden'
                  className='size-3.5 shrink-0 text-muted-foreground'
                />
              )}
            </div>
            <div className='truncate text-muted-foreground' title={detail}>
              {detail}
            </div>
            {stats && <WidgetStats stats={stats} className='mt-1.5' />}
          </div>
        </div>
      </td>
      <td className='hidden px-2 py-2.5 sm:table-cell'>
        <StatePill state={service.state} label={labelOf(service)} />
      </td>
      <td className='px-2 py-2.5 font-mono tabular-nums'>
        {check ? (
          <span className='flex items-center gap-3'>
            <span className='w-10 shrink-0'>{formatMs(check.ms)}</span>
            <Sparkline
              values={check.history.ms}
              measure={MEASURES.response}
              className='hidden min-w-0 flex-1 lg:block'
            />
          </span>
        ) : usage ? (
          <span className='flex items-center gap-3'>
            <span className='w-10 shrink-0'>{formatCpu(usage.cpu)}</span>
            <Sparkline
              values={usage.history.cpu}
              measure={MEASURES.cpu}
              className='hidden min-w-0 flex-1 lg:block'
            />
          </span>
        ) : (
          <span className='text-muted-foreground'>–</span>
        )}
      </td>
      <td
        className={cn(
          'px-2 py-2.5 font-mono tabular-nums',
          !usage && 'text-muted-foreground'
        )}
      >
        {usage ? formatBytes(usage.memory) : '–'}
      </td>
      <td className='hidden truncate px-2 py-2.5 font-mono text-muted-foreground xl:table-cell'>
        {service.stack && shortPath(service.stack.dir)}
      </td>
      <td className='hidden px-3 py-2.5 sm:table-cell'>
        {/* Its own buttons, not a click on the row */}
        <div
          className='flex justify-end gap-0.5'
          onClick={(e) => e.stopPropagation()}
        >
          {service.site ? (
            // Nothing to start or stop: only somewhere to go
            service.url && (
              <Button
                variant='outline'
                size='icon-sm'
                aria-label='Open'
                title='Open'
                className='text-muted-foreground hover:text-foreground'
                asChild
              >
                <a href={service.url} target='_blank' rel='noreferrer'>
                  <ExternalLinkIcon />
                </a>
              </Button>
            )
          ) : (
            <>
              <ActionButton label='Logs' onClick={() => onLogs(service)}>
                <ScrollTextIcon />
              </ActionButton>
              {controls && (
                <ActionButton
                  label='Restart'
                  variant='warning'
                  onClick={() => onRun('restart')}
                >
                  <RotateCwIcon />
                </ActionButton>
              )}
              {!controls ? null : running ? (
                <ActionButton
                  label='Stop'
                  variant='destructive'
                  onClick={() => onRun('stop')}
                >
                  <SquareIcon />
                </ActionButton>
              ) : (
                <ActionButton
                  label='Start'
                  variant='success'
                  onClick={() => onRun('start')}
                >
                  <PlayIcon />
                </ActionButton>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/** In the service window's colours: red to stop, amber to restart, green to start. */
function ActionButton({
  label,
  variant = 'outline',
  onClick,
  children,
}: {
  label: string;
  variant?: 'outline' | 'destructive' | 'warning' | 'success';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={variant}
      size='icon-sm'
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        variant === 'outline' && 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Button>
  );
}
