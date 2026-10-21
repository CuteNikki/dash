import { EyeOffIcon, PencilIcon } from 'lucide-react';

import { formatAddress, formatBytes, formatCpu } from '@/lib/format';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';

import { ServiceIcon } from '@/components/service-icon';
import { Sparkline } from '@/components/sparkline';
import { StatusDot } from '@/components/status-dot';
import { Card } from '@/components/ui/card';

export function ServiceTile({
  service,
  editing,
  onOpen,
}: {
  service: Service;
  /** While editing the dashboard, a tile opens its editor */
  editing: boolean;
  onOpen: (service: Service) => void;
}) {
  const running = isRunning(service.state);
  return (
    <button
      type='button'
      onClick={() => onOpen(service)}
      aria-label={editing ? `Edit ${service.name}` : undefined}
      className='group/tile rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      <Card
        size='sm'
        data-dimmed={!running || service.hidden}
        className='h-full px-3 transition-shadow group-hover/tile:ring-foreground/25 data-[dimmed=true]:opacity-60'
      >
        {/* The icon centred beside the text; the dot level with the name */}
        <div className='flex items-center gap-3'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
            missing={service.iconMissing}
            name={service.name}
          />
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-medium'>{service.name}</div>
            {(service.addresses.length
              ? service.addresses
              : [service.containerName]
            ).map((address) => (
              <div key={address} className='truncate text-muted-foreground'>
                {formatAddress(address)}
              </div>
            ))}
          </div>
          {editing ? (
            <span className='mt-0.5 flex items-center gap-2 self-start text-muted-foreground'>
              {service.hidden && (
                <EyeOffIcon aria-label='Hidden' className='size-4' />
              )}
              <PencilIcon className='size-4' />
            </span>
          ) : (
            <StatusDot state={service.state} className='mt-1.5 self-start' />
          )}
        </div>
        <div className='mt-auto flex items-center gap-3 font-mono text-muted-foreground tabular-nums'>
          {running && service.usage ? (
            <>
              <span>{formatCpu(service.usage.cpu)}</span>
              <span>{formatBytes(service.usage.memory)}</span>
              <Sparkline
                values={service.usage.history.cpu}
                className='ml-auto'
              />
            </>
          ) : (
            <span>{stateLabel(service.state)}</span>
          )}
        </div>
      </Card>
    </button>
  );
}
