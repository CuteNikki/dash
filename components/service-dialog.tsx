'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  ExternalLinkIcon,
  PencilIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
} from 'lucide-react';

import { runContainerAction } from '@/actions/containers';
import type { ContainerAction } from '@/lib/docker';
import { formatBytes, formatCpu } from '@/lib/format';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';

import { LogViewer } from '@/components/log-viewer';
import { ServiceIcon } from '@/components/service-icon';
import { Sparkline } from '@/components/sparkline';
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
      <DialogContent className='flex h-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-5/6 sm:max-w-5xl sm:rounded-xl'>
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

  return (
    <>
      <DialogHeader className='gap-4 border-b p-4'>
        <div className='flex items-center gap-3 pr-8'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
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

      <Tabs defaultValue='logs' className='min-h-0 flex-1 gap-4 p-4'>
        <TabsList>
          <TabsTrigger value='logs'>Logs</TabsTrigger>
          <TabsTrigger value='usage'>Usage</TabsTrigger>
        </TabsList>
        <TabsContent value='logs' className='flex min-h-0 flex-col'>
          <LogViewer
            key={service.containerId}
            containerId={service.containerId}
          />
        </TabsContent>
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

function UsagePanel({ service }: { service: Service }) {
  const usage = service.usage;
  const details = [
    ['Image', service.image],
    ['Container', service.containerName],
    ['Stack', service.stack?.dir ?? 'Not part of a compose stack'],
    ['Status', service.status],
  ];
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid grid-cols-2 gap-4'>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground'>CPU</span>
          <span className='font-mono text-lg tabular-nums'>
            {usage ? formatCpu(usage.cpu) : '–'}
          </span>
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground'>Memory</span>
          <span className='font-mono text-lg tabular-nums'>
            {usage ? formatBytes(usage.memory) : '–'}
          </span>
        </div>
      </div>
      {usage && (
        <div className='flex flex-col gap-2'>
          <span className='text-muted-foreground'>CPU, last ten minutes</span>
          <Sparkline
            values={usage.history}
            className='h-24 w-full text-foreground'
          />
        </div>
      )}
      <dl className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-2'>
        {details.map(([label, value]) => (
          <div key={label} className='contents'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='font-mono break-all'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
