'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArrowUpCircleIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';

import { reloadCaddyConfig, runContainerAction } from '@/actions/containers';
import { resetTile, restoreTile } from '@/actions/tiles';
import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { ContainerAction } from '@/lib/docker/docker';
import { fetcher } from '@/lib/fetcher';
import { formatAddress, MEASURES, type Measure } from '@/lib/format';
import type { GitStatus } from '@/lib/git';
import { isCaddy } from '@/lib/stacks/caddy';
import type { DetailCell, Service } from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';
import { cn } from '@/lib/utils';

import { HistoryChart } from '@/components/charts/history-chart';
import { useCan } from '@/components/common/role';
import { ScrollFade } from '@/components/common/scroll-fade';
import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { FilesPanel } from '@/components/editor/files-panel';
import { GitPanel } from '@/components/git/git-panel';
import { AddressList } from '@/components/service/address-list';
import { AppDetails, Facts, Panel } from '@/components/service/app-details';
import { LogViewer } from '@/components/service/log-viewer';
import { PortList } from '@/components/service/port-list';
import { RemoveServiceDialog } from '@/components/service/remove-service-dialog';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill } from '@/components/service/status-dot';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpdateDialog } from '@/components/updates/update-dialog';

const DONE: Record<ContainerAction, string> = {
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
};

/** A service's logs, usage and controls, over the dashboard. */
export function ServiceDialog({
  service,
  onCloseAction,
  onChangedAction,
  onEditAction,
  tab = 'usage',
  memoryTotal,
}: {
  service?: Service;
  onCloseAction: () => void;
  /** Called after an action, so the dashboard refreshes right away */
  onChangedAction: () => void;
  onEditAction: (service: Service) => void;
  /** The tab it opens on */
  tab?: 'usage' | 'logs';
  /** The server's memory, in bytes, which a container's is charted against */
  memoryTotal?: number;
}) {
  // Its removal's window, here rather than in the body, so the service it's
  // removing can be held on to
  const [removing, setRemoving] = useState(false);
  const [last, setLast] = useState(service);
  if (service && service !== last) setLast(service);
  // Removing takes its containers down, and with them the service from the
  // dashboard's next look; the window stays on the last one seen until its
  // removal's closed, so what that printed and how it went aren't lost
  const shown = service ?? (removing ? last : undefined);

  function close() {
    setRemoving(false);
    onCloseAction();
  }

  return (
    <Dialog open={!!shown} onOpenChange={(open) => !open && close()}>
      {/* Full screen on a phone, a large window in the middle on a computer */}
      <DialogContent
        className='flex h-full max-h-none max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-5/6 sm:max-w-7xl sm:rounded-xl'
        // Focus the window itself, not its first button, whose tooltip
        // would open with it; Tab still reaches every button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {shown && (
          <ServiceBody
            service={shown}
            confirmRemove={removing}
            setConfirmRemove={setRemoving}
            onChanged={onChangedAction}
            onRemoved={() => {
              onChangedAction();
              close();
            }}
            onEdit={onEditAction}
            tab={tab}
            memoryTotal={memoryTotal}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ServiceBody({
  service,
  confirmRemove,
  setConfirmRemove,
  onChanged,
  onRemoved,
  onEdit,
  tab,
  memoryTotal,
}: {
  service: Service;
  /** Whether its removal's window is open */
  confirmRemove: boolean;
  setConfirmRemove: (open: boolean) => void;
  onChanged: () => void;
  /** Called once its stack is removed, which closes the window */
  onRemoved: () => void;
  onEdit: (service: Service) => void;
  tab: 'usage' | 'logs';
  memoryTotal?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const running = isRunning(service.state);
  // A website elsewhere: nothing to start or stop, only how it answers
  const site = !!service.site;
  // What their role may use: starting and stopping, or its files, git and
  // console too, which reach the whole server
  const may = useCan();
  const controls = may('control');
  const manages = may('manage');
  // The repository its stack is in, if any: a Git tab shows once it's known
  const { data: git, mutate: rereadGit } = useSWR<GitStatus | null>(
    service.stack && manages
      ? `/api/containers/${service.containerId}/git`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  function run(action: ContainerAction) {
    startTransition(() =>
      attempt(`Couldn't ${action} ${service.name}`, async () => {
        const result = await runContainerAction(service.containerId, action);
        if (result.ok) toast.success(`${DONE[action]} ${service.name}`);
        else
          toast.error(`Couldn't ${action} ${service.name}`, {
            description: result.error,
          });
        onChanged();
      })
    );
  }

  /** A website is only its tile: removing it forgets that, with Undo. */
  function removeSite() {
    startTransition(() =>
      attempt(`Couldn't remove ${service.name}`, async () => {
        const before = await resetTile(service.key);
        toast.success(`Removed ${service.name}`, {
          action: before && {
            label: 'Undo',
            onClick: () =>
              attempt(`Couldn't restore ${service.name}`, async () => {
                await restoreTile(before);
                toast.success(`Restored ${service.name}`);
                onChanged();
              }),
          },
        });
        onRemoved();
      })
    );
  }

  function reloadConfig() {
    startTransition(() =>
      attempt('Caddy kept its old config', async () => {
        const result = await reloadCaddyConfig(service.containerId);
        if (result.ok) toast.success('Caddy is using the new Caddyfile');
        else
          toast.error('Caddy kept its old config', {
            description: result.error,
          });
      })
    );
  }

  return (
    <>
      <DialogHeader className='gap-4 border-b p-4'>
        <div className='flex items-center gap-3 pr-8'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
            missing={service.iconMissing}
            name={service.name}
            className='size-10'
          />
          <div className='min-w-0'>
            <DialogTitle className='truncate text-base'>
              {service.name}
            </DialogTitle>
            {/* Its container, or a website's host, alone, its state being
                with what changes it */}
            <DialogDescription className='truncate font-mono'>
              {service.containerName}
            </DialogDescription>
          </div>
        </div>
        {service.addresses.length > 0 && (
          <AddressList addresses={service.addresses} />
        )}
        <div className='flex flex-wrap items-center gap-2'>
          {/* As tall as the buttons beside it, its text level with theirs */}
          <StatePill
            state={service.state}
            label={labelOf(service)}
            className='mr-1 h-7 items-center px-2'
          />
          {site || !controls ? null : running ? (
            <Button
              variant='destructive'
              disabled={pending}
              onClick={() => setConfirmStop(true)}
            >
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button
              variant='success'
              disabled={pending}
              onClick={() => run('start')}
            >
              <PlayIcon />
              Start
            </Button>
          )}
          {!site && controls && (
            <Button
              variant='warning'
              disabled={pending || !running}
              onClick={() => run('restart')}
            >
              <RotateCwIcon />
              Restart
            </Button>
          )}
          {isCaddy(service.image) && manages && (
            <Button
              variant='outline'
              disabled={pending || !running}
              title='Reads the Caddyfile again without restarting, so no site goes down'
              onClick={reloadConfig}
            >
              <RefreshCwIcon />
              Reload config
            </Button>
          )}
          {manages && (
            <Button variant='outline' onClick={() => onEdit(service)}>
              <PencilIcon />
              Edit tile
            </Button>
          )}
          {/* New commits rebuild the whole stack, which only they may */}
          {service.update &&
            controls &&
            (service.update.kind !== 'commits' || manages) && (
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => setConfirmUpdate(true)}
                className='text-update hover:text-update'
              >
                <ArrowUpCircleIcon />
                Update
                <span className='font-mono'>{updateLabel(service.update)}</span>
              </Button>
            )}
          {(service.removable || site) && manages && (
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => (site ? removeSite() : setConfirmRemove(true))}
              className='text-destructive hover:text-destructive'
            >
              <Trash2Icon />
              Remove
            </Button>
          )}
          {service.url && (
            <Button variant='outline' className='ml-auto' asChild>
              <a href={service.url} target='_blank' rel='noreferrer'>
                <ExternalLinkIcon />
                Open
              </a>
            </Button>
          )}
        </div>
      </DialogHeader>

      {site ? (
        <div className='min-h-0 flex-1 p-4'>
          <ScrollFade
            fill
            className='h-full overflow-x-hidden overflow-y-auto'
            fadeFrom='from-popover'
          >
            <SitePanel service={service} />
          </ScrollFade>
        </div>
      ) : (
        <Tabs defaultValue={tab} className='min-h-0 flex-1 gap-4 p-4'>
          <TabsList>
            <TabsTrigger value='usage'>Usage</TabsTrigger>
            <TabsTrigger value='logs'>
              {service.console && manages ? 'Console' : 'Logs'}
            </TabsTrigger>
            {service.stack && manages && (
              <TabsTrigger value='files'>Files</TabsTrigger>
            )}
            {git && (
              <TabsTrigger value='git'>
                Git
                {git.changes.length > 0 && (
                  <span className='font-mono text-muted-foreground tabular-nums'>
                    {git.changes.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value='logs' className='flex min-h-0 flex-col'>
            <LogViewer
              key={service.containerId}
              containerId={service.containerId}
              commands={service.console && manages ? { running } : undefined}
            />
          </TabsContent>
          {service.stack && manages && (
            <TabsContent value='files' className='flex min-h-0 flex-col'>
              {/* By stack, so unsaved edits survive the container being recreated */}
              <FilesPanel
                key={service.stack.dir}
                containerId={service.containerId}
                onDeployedAction={onChanged}
                onFilesChangedAction={() => void rereadGit()}
              />
            </TabsContent>
          )}
          {git && (
            <TabsContent value='git' className='flex min-h-0 flex-col'>
              <GitPanel
                key={git.root}
                containerId={service.containerId}
                status={git}
                onChangedAction={rereadGit}
              />
            </TabsContent>
          )}
          {/* Scrolls within the window, as the other tabs' panels do */}
          <TabsContent value='usage' className='min-h-0'>
            <ScrollFade
              fill
              className='h-full overflow-x-hidden overflow-y-auto'
              fadeFrom='from-popover'
            >
              <UsagePanel service={service} memoryTotal={memoryTotal} />
            </ScrollFade>
          </TabsContent>
        </Tabs>
      )}

      {/* Kept once its update is done, to show how it went until closed */}
      <UpdateDialog
        service={service}
        open={confirmUpdate}
        onOpenChangeAction={setConfirmUpdate}
        onUpdatedAction={onChanged}
      />
      {service.removable && (
        <RemoveServiceDialog
          service={service}
          open={confirmRemove}
          onOpenChangeAction={setConfirmRemove}
          onRemovedAction={onRemoved}
        />
      )}
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop {service.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays stopped until you start it again, including after the
              server restarts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => run('stop')}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** One measure as a card: its current value, and the last ten minutes of it. */
function UsageChart({
  label,
  value,
  values,
  times,
  measure,
  measuring,
}: {
  label: string;
  value?: number;
  values?: number[];
  times?: number[];
  measure: Measure;
  /** Running, but not measured yet: its value's to come */
  measuring: boolean;
}) {
  return (
    <Panel title={label}>
      <span className='flex items-baseline justify-between gap-2'>
        <span className='font-mono text-lg tabular-nums'>
          {value !== undefined ? (
            measure.format(value)
          ) : measuring ? (
            <TextSkeleton className='w-16' />
          ) : (
            '–'
          )}
        </span>
        <span className='text-muted-foreground'>last ten minutes</span>
      </span>
      {/* The chart's room, kept until there are readings to draw */}
      <div className='h-16'>
        {values && times && (
          <HistoryChart
            label={`${label} over the last ten minutes`}
            times={times}
            series={[{ label, values, measure }]}
            className='h-full text-foreground'
          />
        )}
      </div>
    </Panel>
  );
}

/** A website's response time over the last ten minutes, and how it last answered. */
function SitePanel({ service }: { service: Service }) {
  const check = service.site?.check;
  const facts: { label: string; value: DetailCell }[] = [
    { label: 'Status', value: service.status },
    {
      label: 'Address',
      value: service.url ? formatAddress(service.url) : 'None to check',
    },
    ...(check ? [{ label: 'Last checked', value: { at: check.at } }] : []),
    { label: 'Checked', value: 'Every 30 seconds' },
  ];
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <UsageChart
        label='Response time'
        value={check?.ms}
        values={check?.history.ms}
        times={check?.history.at}
        measure={MEASURES.response}
        measuring={!check && !!service.url}
      />
      <Panel title='Website'>
        <Facts facts={facts} />
      </Panel>
    </div>
  );
}

/**
 * What it is and what it uses, each a card, and what its app has to say
 * when it has something: that in the middle, as what's most its own, with
 * the rest in a column beside it where there's room, below it where not.
 */
function UsagePanel({
  service,
  memoryTotal,
}: {
  service: Service;
  memoryTotal?: number;
}) {
  const usage = service.usage;
  // A running one that hasn't been measured yet, as just after it starts
  const measuring =
    !usage && ['running', 'unhealthy', 'starting'].includes(service.state);
  const app = service.details && isRunning(service.state);
  const facts = [
    { label: 'Status', value: service.status },
    { label: 'Image', value: service.image },
    { label: 'Container', value: service.containerName },
    {
      label: 'Stack',
      value: service.stack?.dir ?? 'Not part of a compose stack',
    },
    ...(service.version ? [{ label: 'Version', value: service.version }] : []),
    {
      label: 'Updates',
      value: service.update
        ? `${updateLabel(service.update)} available`
        : service.updateError
          ? `Couldn't check: ${service.updateError}`
          : 'None found',
    },
  ];
  return (
    <div
      className={cn(
        // Columns no wider than the window, whatever's in them
        'grid grid-cols-1 gap-3',
        app && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'
      )}
    >
      {app && (
        <div className='flex min-w-0 flex-col gap-3'>
          <AppDetails containerId={service.containerId} />
        </div>
      )}
      {/* Side by side below it, or one above another in the column beside it */}
      <div
        className={cn(
          'grid grid-cols-1 gap-3 sm:grid-cols-2',
          app && 'lg:grid-cols-1'
        )}
      >
        <UsageChart
          label='CPU'
          value={usage?.cpu}
          values={usage?.history.cpu}
          times={usage?.history.at}
          measure={MEASURES.cpu}
          measuring={measuring}
        />
        <UsageChart
          label='Memory'
          value={usage?.memory}
          values={usage?.history.memory}
          times={usage?.history.at}
          // Against the server's memory, so a steady amount sits as low as
          // its share is, rather than at the top of a scale it alone sets,
          // and a leak shows as a climb
          measure={
            memoryTotal
              ? { ...MEASURES.memory, floor: memoryTotal }
              : MEASURES.memory
          }
          measuring={measuring}
        />
        <Panel
          title='Container'
          className={cn('sm:col-span-2', app && 'lg:col-span-1')}
        >
          <Facts facts={facts} />
        </Panel>
        {service.ports && service.ports.length > 0 && (
          <Panel
            title='Ports'
            className={cn('sm:col-span-2', app && 'lg:col-span-1')}
          >
            <PortList service={service} />
          </Panel>
        )}
      </div>
    </div>
  );
}
