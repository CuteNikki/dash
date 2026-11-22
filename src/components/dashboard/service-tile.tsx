import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import type { Format } from '@/i18n/format';
import { useFormat } from '@/i18n/use-format';

import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { TileGraph } from '@/lib/dashboard/tiles';
import { MEASURES, type Measure } from '@/lib/format';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Sparkline } from '@/components/charts/sparkline';
import { WidgetStats, widgetStats } from '@/components/charts/widget-stats';
import { AddressText, addressWords } from '@/components/service/address-text';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatusDot } from '@/components/service/status-dot';
import { Card } from '@/components/ui/card';
import { UpdateBadge } from '@/components/updates/update-badge';

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
  const ts = useTranslations('status');
  const format = useFormat();
  const t = useTranslations('dashboard');
  const running = isRunning(service.state);
  const readings = readingsOf(service, format, t('noAnswer'));
  // A taller tile has room for its graphs as one of their own
  const graph = service.height > 1;
  const on = (readings?.graphs ?? []).filter(
    (g) => !service.hiddenGraphs.includes(g.key)
  );
  // A wider one has room for two, each with its number; a narrow one for
  // the first that's on
  const paired = service.width > 1 && on.length > 1;
  const graphs = paired ? on : on.slice(0, 1);
  const stats = widgetStats(service);
  const addresses = service.addresses.length
    ? service.addresses
    : [service.containerName];
  return (
    <button
      type='button'
      onClick={() => onOpen(service)}
      aria-label={editing ? t('edit', { name: service.name }) : undefined}
      className='group/tile size-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      <Card
        size='sm'
        data-dimmed={!running || service.hidden}
        className='group/card h-full px-3 transition-shadow group-hover/tile:ring-foreground/25 dark:group-hover/tile:ring-foreground/25'
      >
        {/* A stopped or hidden one fades its icon, name and graph, the rest
            left readable: its state above all */}
        {/* The icon centred beside the text; the dot level with the name */}
        <div className='flex items-center gap-3'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
            missing={service.iconMissing}
            name={service.name}
            className='group-data-[dimmed=true]/card:opacity-60'
          />
          <div className='min-w-0 flex-1'>
            <div className='truncate text-sm font-medium group-data-[dimmed=true]/card:opacity-60'>
              {service.name}
            </div>
            {service.description && (
              <div
                className='truncate text-muted-foreground'
                title={service.description}
              >
                {service.description}
              </div>
            )}
            {/* Every address on one line, to keep the tile short */}
            <div
              className='truncate text-muted-foreground'
              title={addresses.map(addressWords).join(' · ')}
            >
              {addresses.map((address, i) => (
                <Fragment key={address}>
                  {i > 0 && ' · '}
                  <AddressText entry={address} />
                </Fragment>
              ))}
            </div>
          </div>
          {/* While arranging, whether it's hidden is the eye on its corner */}
          {!editing && (
            // An update waiting, beside how it's doing
            // As tall as the name's line, so both sit level with it
            <span className='flex h-5 items-center gap-1.5 self-start'>
              {service.update && <UpdateBadge update={service.update} />}
              <StatusDot state={service.state} label={labelOf(service)} />
            </span>
          )}
        </div>
        {stats && <WidgetStats stats={stats} />}
        {graph && graphs.length > 0 && (
          // Fills the room the tile has, without asking for any of its own,
          // each graph above its number when there are two
          <div
            className={cn(
              'grid min-h-8 flex-1 gap-3 group-data-[dimmed=true]/card:opacity-60',
              paired && 'grid-cols-2'
            )}
          >
            {graphs.map((g) => (
              <div key={g.key} className='relative'>
                <Sparkline {...g} className='absolute inset-0 size-full' />
              </div>
            ))}
          </div>
        )}
        {readings && paired ? (
          // Each number with its graph beside it, or below it on a taller tile
          <div className='mt-auto grid grid-cols-2 gap-3 font-mono text-muted-foreground tabular-nums'>
            {graphs.map((g) => (
              <div key={g.key} className='flex min-w-0 items-center gap-3'>
                <span>{g.number}</span>
                {!graph && (
                  <Sparkline
                    {...g}
                    className='w-auto max-w-64 flex-1 group-data-[dimmed=true]/card:opacity-60'
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className='mt-auto flex items-center gap-3 font-mono text-muted-foreground tabular-nums'>
            {readings ? (
              <>
                {readings.numbers.map((n, i) => (
                  <span key={i}>{n}</span>
                ))}
                {!graph && graphs[0] && (
                  <Sparkline
                    {...graphs[0]}
                    // A wider tile draws it wider
                    className={cn(
                      'ml-auto group-data-[dimmed=true]/card:opacity-60',
                      service.width > 1 && 'w-auto max-w-64 flex-1'
                    )}
                  />
                )}
              </>
            ) : (
              <span>{ts(labelOf(service))}</span>
            )}
          </div>
        )}
      </Card>
    </button>
  );
}

/**
 * What a tile shows at its foot, and graphs: a container's CPU and memory,
 * and both over time; a website's response time and what it answered, and
 * its response time over time. None for a stopped container or an
 * unchecked site.
 */
function readingsOf(
  service: Service,
  format: Format,
  /** What a site that didn't answer says in place of its status */
  noAnswer: string
):
  | {
      numbers: string[];
      /** Each with the number it's of */
      graphs: {
        key: TileGraph;
        number: string;
        values: number[];
        times: number[];
        measure: Measure;
        fit?: boolean;
      }[];
    }
  | undefined {
  const check = service.site?.check;
  if (check) {
    const ms = format.ms(check.ms);
    return {
      numbers: [ms, check.status ? `${check.status}` : noAnswer],
      graphs: [
        {
          key: 'response',
          number: ms,
          values: check.history.ms,
          times: check.history.at,
          measure: MEASURES.response,
        },
      ],
    };
  }
  const usage = isRunning(service.state) ? service.usage : undefined;
  if (!usage) return undefined;
  const cpu = format.cpu(usage.cpu);
  const memory = format.bytes(usage.memory);
  return {
    numbers: [cpu, memory],
    graphs: [
      {
        key: 'cpu',
        number: cpu,
        values: usage.history.cpu,
        times: usage.history.at,
        measure: MEASURES.cpu,
      },
      {
        key: 'memory',
        number: memory,
        values: usage.history.memory,
        times: usage.history.at,
        measure: MEASURES.memory,
        // As it barely moves, to show its shape
        fit: true,
      },
    ],
  };
}
