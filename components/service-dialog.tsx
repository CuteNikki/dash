'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ExternalLinkIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SquareIcon,
} from 'lucide-react';

import { reloadCaddyConfig, runContainerAction } from '@/actions/containers';
import { isCaddy } from '@/lib/caddy';
import type { ContainerAction } from '@/lib/docker';
import { fetcher } from '@/lib/fetcher';
import { MEASURES, type Measure } from '@/lib/format';
import type { GitStatus } from '@/lib/git';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';

import { AddressList } from '@/components/address-list';
import { FilesPanel } from '@/components/files-panel';
import { GitPanel } from '@/components/git-panel';
import { HistoryChart } from '@/components/history-chart';
import { LogViewer } from '@/components/log-viewer';
import { ServiceIcon } from '@/components/service-icon';
import { TextSkeleton } from '@/components/skeletons';
import { StatusDot } from '@/components/status-dot';
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

const DONE: Record<ContainerAction, string> = {
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
};

/** A service's logs, usage and controls, over the dashboard. */
export function ServiceDialog({
  service,
  onClose,
  onChanged,
  onEdit,
}: {
  service?: Service;
  onClose: () => void;
  /** Called after an action, so the dashboard refreshes right away */
  onChanged: () => void;
  onEdit: (service: Service) => void;
}) {
  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      {/* Full screen on a phone, a large window in the middle on a computer */}
      <DialogContent
        className='flex h-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-5/6 sm:max-w-7xl sm:rounded-xl'
        // Focus the window itself, not its first button, whose tooltip
        // would open with it; Tab still reaches every button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {service && (
          <ServiceBody
            service={service}
            onChanged={onChanged}
            onEdit={onEdit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ServiceBody({
  service,
  onChanged,
  onEdit,
}: {
  service: Service;
  onChanged: () => void;
  onEdit: (service: Service) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmStop, setConfirmStop] = useState(false);
  const running = isRunning(service.state);
  // The repository its stack is in, if any: a Git tab shows once it's known
  const { data: git, mutate: rereadGit } = useSWR<GitStatus | null>(
    service.stack ? `/api/containers/${service.containerId}/git` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  function run(action: ContainerAction) {
    startTransition(async () => {
      const result = await runContainerAction(service.containerId, action);
      if (result.ok) toast.success(`${DONE[action]} ${service.name}`);
      else
        toast.error(`Couldn't ${action} ${service.name}`, {
          description: result.error,
        });
      onChanged();
    });
  }

  function reloadConfig() {
    startTransition(async () => {
      const result = await reloadCaddyConfig(service.containerId);
      if (result.ok) toast.success('Caddy is using the new Caddyfile');
      else
        toast.error('Caddy kept its old config', { description: result.error });
    });
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
            <DialogDescription className='flex items-center gap-2'>
              <StatusDot state={service.state} />
              {stateLabel(service.state)}
              <span className='truncate font-mono'>
                {service.containerName}
              </span>
            </DialogDescription>
          </div>
        </div>
        {service.addresses.length > 0 && (
          <AddressList addresses={service.addresses} />
        )}
        <div className='flex flex-wrap items-center gap-2'>
          {running ? (
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
          <Button
            variant='warning'
            disabled={pending || !running}
            onClick={() => run('restart')}
          >
            <RotateCwIcon />
            Restart
          </Button>
          {isCaddy(service.image) && (
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
          <Button variant='outline' onClick={() => onEdit(service)}>
            <PencilIcon />
            Edit tile
          </Button>
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

      <Tabs defaultValue='usage' className='min-h-0 flex-1 gap-4 p-4'>
        <TabsList>
          <TabsTrigger value='usage'>Usage</TabsTrigger>
          <TabsTrigger value='logs'>Logs</TabsTrigger>
          {service.stack && <TabsTrigger value='files'>Files</TabsTrigger>}
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
          />
        </TabsContent>
        {service.stack && (
          <TabsContent value='files' className='flex min-h-0 flex-col'>
            {/* By stack, so unsaved edits survive the container being recreated */}
            <FilesPanel
              key={service.stack.dir}
              containerId={service.containerId}
              onDeployed={onChanged}
            />
          </TabsContent>
        )}
        {git && (
          <TabsContent value='git' className='flex min-h-0 flex-col'>
            <GitPanel
              key={git.root}
              containerId={service.containerId}
              status={git}
              onChanged={rereadGit}
            />
          </TabsContent>
        )}
        <TabsContent value='usage'>
          <UsagePanel service={service} />
        </TabsContent>
      </Tabs>

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

/** One measure: its current value, and the last ten minutes of it. */
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
    <div className='flex flex-col gap-2'>
      <span className='text-muted-foreground'>{label}, last ten minutes</span>
      <span className='font-mono text-lg tabular-nums'>
        {value !== undefined ? (
          measure.format(value)
        ) : measuring ? (
          <TextSkeleton className='w-16' />
        ) : (
          '–'
        )}
      </span>
      {/* The chart's room, kept until there are readings to draw */}
      <div className='h-24'>
        {values && times && (
          <HistoryChart
            label={`${label} over the last ten minutes`}
            times={times}
            series={[{ label, values, measure }]}
            className='h-full text-foreground'
          />
        )}
      </div>
    </div>
  );
}

function UsagePanel({ service }: { service: Service }) {
  const usage = service.usage;
  // A running one that hasn't been measured yet, as just after it starts
  const measuring =
    !usage && ['running', 'unhealthy', 'starting'].includes(service.state);
  const details = [
    ['Image', service.image],
    ['Container', service.containerName],
    ['Stack', service.stack?.dir ?? 'Not part of a compose stack'],
    ['Status', service.status],
  ];
  return (
    <div className='flex flex-col gap-6'>
      <dl className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-2'>
        {details.map(([label, value]) => (
          <div key={label} className='contents'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='font-mono break-all'>{value}</dd>
          </div>
        ))}
      </dl>
      <div className='flex flex-col gap-6'>
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
          measure={MEASURES.memory}
          measuring={measuring}
        />
      </div>
    </div>
  );
}
