import { EyeOffIcon } from 'lucide-react';

import { formatAddress, formatBytes, formatCpu, MEASURES } from '@/lib/format';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ServiceIcon } from '@/components/service-icon';
import { Sparkline } from '@/components/sparkline';
import { StatusDot } from '@/components/status-dot';
import { Card } from '@/components/ui/card';
import { WidgetStats, widgetStats } from '@/components/widget-stats';

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
  const usage = running ? service.usage : undefined;
  // A taller tile has room for its CPU as a graph of its own
  const graph = service.height > 1;
  const stats = widgetStats(service);
  return (
    <button
      type='button'
      onClick={() => onOpen(service)}
      aria-label={editing ? `Edit ${service.name}` : undefined}
      className='group/tile size-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
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
            {service.description && (
              <div className='truncate' title={service.description}>
                {service.description}
              </div>
            )}
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
            </span>
          ) : (
            <StatusDot state={service.state} className='mt-1.5 self-start' />
          )}
        </div>
        {stats && <WidgetStats stats={stats} />}
        {graph && usage && (
          // Fills the room the tile has, without asking for any of its own
          <div className='relative min-h-8 flex-1'>
            <Sparkline
              values={usage.history.cpu}
              measure={MEASURES.cpu}
              className='absolute inset-0 size-full'
            />
          </div>
        )}
        <div className='mt-auto flex items-center gap-3 font-mono text-muted-foreground tabular-nums'>
          {usage ? (
            <>
              <span>{formatCpu(usage.cpu)}</span>
              <span>{formatBytes(usage.memory)}</span>
              {!graph && (
                <Sparkline
                  values={usage.history.cpu}
                  measure={MEASURES.cpu}
                  // A wider tile draws it wider
                  className={cn(
                    'ml-auto',
                    service.width > 1 && 'w-auto max-w-64 flex-1'
                  )}
                />
              )}
            </>
          ) : (
            <span>{stateLabel(service.state)}</span>
          )}
        </div>
      </Card>
    </button>
  );
}
