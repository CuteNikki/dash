import { formatBytes, formatCpu, formatHost } from '@/lib/format';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';

import { ServiceIcon } from '@/components/service-icon';
import { Sparkline } from '@/components/sparkline';
import { StatusDot } from '@/components/status-dot';
import { Card } from '@/components/ui/card';

export function ServiceTile({
  service,
  onOpen,
}: {
  service: Service;
  onOpen: (service: Service) => void;
}) {
  const running = isRunning(service.state);
  return (
    <button
      type='button'
      onClick={() => onOpen(service)}
      className='rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      <Card
        size='sm'
        className='h-full px-3 transition-shadow hover:ring-foreground/25 data-[running=false]:opacity-60'
        data-running={running}
      >
        <div className='flex items-center gap-3'>
          <ServiceIcon icon={service.icon} name={service.name} />
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-medium'>{service.name}</div>
            <div className='truncate text-muted-foreground'>
              {service.url ? formatHost(service.url) : service.containerName}
            </div>
          </div>
          <StatusDot state={service.state} />
        </div>
        <div className='flex items-center gap-3 font-mono text-muted-foreground tabular-nums'>
          {running && service.usage ? (
            <>
              <span>{formatCpu(service.usage.cpu)}</span>
              <span>{formatBytes(service.usage.memory)}</span>
              <Sparkline values={service.usage.history} className='ml-auto' />
            </>
          ) : (
            <span>{stateLabel(service.state)}</span>
          )}
        </div>
      </Card>
    </button>
  );
}
