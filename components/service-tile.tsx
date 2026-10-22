import { EyeOffIcon } from 'lucide-react';

import {
  formatAddress,
  formatBytes,
  formatCpu,
  formatMs,
  MEASURES,
  type Measure,
} from '@/lib/format';
import { isRunning, labelOf } from '@/lib/status';
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
  const readings = readingsOf(service);
  // A taller tile has room for its graph as one of its own
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
            <StatusDot
              state={service.state}
              label={labelOf(service)}
              className='mt-1.5 self-start'
            />
          )}
        </div>
        {stats && <WidgetStats stats={stats} />}
        {graph && readings && (
          // Fills the room the tile has, without asking for any of its own
          <div className='relative min-h-8 flex-1'>
            <Sparkline
              values={readings.values}
              measure={readings.measure}
              className='absolute inset-0 size-full'
            />
          </div>
        )}
        <div className='mt-auto flex items-center gap-3 font-mono text-muted-foreground tabular-nums'>
          {readings ? (
            <>
              {readings.numbers.map((n, i) => (
                <span key={i}>{n}</span>
              ))}
              {!graph && (
                <Sparkline
                  values={readings.values}
                  measure={readings.measure}
                  // A wider tile draws it wider
                  className={cn(
                    'ml-auto',
                    service.width > 1 && 'w-auto max-w-64 flex-1'
                  )}
                />
              )}
            </>
          ) : (
            <span>{labelOf(service)}</span>
          )}
        </div>
      </Card>
    </button>
  );
}

/**
 * What a tile shows at its foot, and graphs: a container's CPU and memory,
 * its CPU over time; a website's response time and what it answered, its
 * response time over time. None for a stopped container or an unchecked site.
 */
function readingsOf(
  service: Service
): { numbers: string[]; values: number[]; measure: Measure } | undefined {
  const check = service.site?.check;
  if (check) {
    return {
      numbers: [
        formatMs(check.ms),
        check.status ? `${check.status}` : 'no answer',
      ],
      values: check.history.ms,
      measure: MEASURES.response,
    };
  }
  const usage = isRunning(service.state) ? service.usage : undefined;
  if (!usage) return undefined;
  return {
    numbers: [formatCpu(usage.cpu), formatBytes(usage.memory)],
    values: usage.history.cpu,
    measure: MEASURES.cpu,
  };
}
