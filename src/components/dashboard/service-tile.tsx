import { useTranslations } from 'next-intl';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import {
  ActivityIcon,
  CpuIcon,
  MemoryStickIcon,
  NetworkIcon,
} from 'lucide-react';

import type { Format } from '@/i18n/format';
import { useFormat } from '@/i18n/use-format';

import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { TileItem } from '@/lib/dashboard/tiles';
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

/** Room to spare, in the numbers' own size, before four go back in a row: two digits' worth */
const SPARE_EM = 1.2;

export function ServiceTile({
  service,
  editing,
  onOpen,
}: {
  service: Service;
  /** While editing the dashboard, a tile opens its editor */
  editing: boolean;
  /** With Shift held, to edit it */
  onOpen: (service: Service, edit?: boolean) => void;
}) {
  const ts = useTranslations('status');
  const format = useFormat();
  const t = useTranslations('dashboard');
  const running = isRunning(service.state);
  const tHost = useTranslations('host');
  const readings = readingsOf(service, format, t('noAnswer'), {
    down: tHost('down'),
    up: tHost('up'),
    read: tHost('read'),
    write: tHost('write'),
  });
  // A taller tile has room for its graphs as one of their own
  const graph = service.height > 1;
  const numbers = new Set(service.foot.numbers);
  const graphed = new Set(service.foot.graphs);
  const icons = new Set(service.foot.icons);
  // What it's set to show, of what it has
  const shown = (readings ?? []).filter(
    (r) => numbers.has(r.id) || (graphed.has(r.id) && r.values)
  );
  /** Whether its graph's beside its number, as on a tile one row tall */
  const inline = (r: Reading) => !graph && graphed.has(r.id) && !!r.values;
  // With graphs beside them, two to a row, or four on a wider tile; numbers
  // alone all in a row, but four only where they fit, else two by two
  const withGraphs = shown.some(inline);
  const fourAcross = !withGraphs && shown.length === 4;
  const footRef = useRef<HTMLDivElement>(null);
  const [across, setAcross] = useState(true);
  // Whether four numbers fit side by side, as they are now: each as wide as
  // its text, and the gaps between. Before it's drawn, and again as the
  // numbers or the tile's width change, so it never shows three and one
  useLayoutEffect(() => {
    const foot = footRef.current;
    if (!fourAcross || !foot) return;
    const check = () => {
      const cells = [...foot.children];
      const gap = parseFloat(getComputedStyle(foot).columnGap) || 0;
      const needed = cells.reduce(
        (sum, cell) =>
          sum + (cell.firstElementChild?.getBoundingClientRect().width ?? 0),
        gap * (cells.length - 1)
      );
      // Back to four only with a little to spare, so a number gaining a
      // digit at the edge doesn't flip it every few seconds
      const spare = parseFloat(getComputedStyle(foot).fontSize) * SPARE_EM;
      setAcross((was) =>
        was ? needed <= foot.clientWidth : needed + spare <= foot.clientWidth
      );
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(foot);
    return () => observer.disconnect();
  });
  const columns = Math.min(
    shown.length,
    withGraphs ? (service.width > 1 ? 4 : 2) : shown.length
  );
  const graphs = shown.filter(
    (r): r is Reading & { values: number[] } =>
      graphed.has(r.id) && r.values !== undefined
  );
  const stats = widgetStats(service);
  const addresses = service.addresses.length
    ? service.addresses
    : [service.containerName];
  return (
    <button
      type='button'
      onClick={(e) => onOpen(service, e.shiftKey)}
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
          // its graphs side by side above their numbers
          <div
            className='grid min-h-8 flex-1 gap-3 group-data-[dimmed=true]/card:opacity-60'
            style={{
              gridTemplateColumns: `repeat(${graphs.length}, minmax(0, 1fr))`,
            }}
          >
            {graphs.map((g) => (
              <div key={g.id} className='relative'>
                <Sparkline
                  values={g.values}
                  times={g.times}
                  measure={g.measure}
                  fit={g.fit}
                  className='absolute inset-0 size-full'
                />
              </div>
            ))}
          </div>
        )}
        {readings ? (
          shown.length > 0 && (
            // Each reading its number with its graph right after, in even
            // columns: two to a row with graphs, four on a wider tile; four
            // numbers alone in a row where they fit, else two by two
            <div className='mt-auto'>
              <div
                ref={footRef}
                className={cn(
                  'grid gap-x-3 gap-y-1 font-mono text-muted-foreground tabular-nums',
                  // Each only as wide as it is, the room left between them
                  fourAcross &&
                    (across
                      ? 'grid-cols-[repeat(4,auto)] justify-between'
                      : 'grid-cols-2')
                )}
                style={
                  fourAcross
                    ? undefined
                    : {
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      }
                }
              >
                {shown.map((item) => (
                  <div
                    key={item.id}
                    title={item.title}
                    className='flex min-w-0 items-center gap-2'
                  >
                    {/* Its icon first, before its number, or its graph alone */}
                    {(icons.has(item.id) || numbers.has(item.id)) && (
                      <span className='flex items-center gap-1 whitespace-nowrap'>
                        {icons.has(item.id) && item.icon}
                        {numbers.has(item.id) && item.number}
                      </span>
                    )}
                    {inline(item) && item.values && (
                      <Sparkline
                        values={item.values}
                        times={item.times}
                        measure={item.measure}
                        fit={item.fit}
                        // A little longer on a wider tile, and shorter where
                        // there's no room
                        className={cn(
                          'min-w-0 shrink group-data-[dimmed=true]/card:opacity-60',
                          service.width > 1 && 'w-24'
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className='mt-auto font-mono text-muted-foreground'>
            {ts(labelOf(service))}
          </div>
        )}
      </Card>
    </button>
  );
}

/** One of a tile's readings: its number, and what its graph draws, if it has one. */
type Reading = {
  id: TileItem;
  number: string;
  /** Beside its number, to tell what it is: a website's need none */
  icon?: React.ReactNode;
  /** In full, on hover, as both ways a network's flowing */
  title?: string;
  values?: number[];
  times: number[];
  measure: Measure;
  fit?: boolean;
};

/**
 * What a tile can show at its foot, each a number and most a graph: a
 * container's CPU, memory, network and disk; a website's response time and
 * what it answered. None for a stopped container or an unchecked site.
 */
function readingsOf(
  service: Service,
  format: Format,
  /** What a site that didn't answer says in place of its status */
  noAnswer: string,
  words: { down: string; up: string; read: string; write: string }
): Reading[] | undefined {
  const check = service.site?.check;
  if (check) {
    const times = check.history.at;
    return [
      {
        id: 'response',
        number: format.ms(check.ms),
        values: check.history.ms,
        times,
        measure: MEASURES.response,
      },
      {
        id: 'status',
        number: check.status ? `${check.status}` : noAnswer,
        times,
        measure: MEASURES.response,
      },
    ];
  }
  const usage = isRunning(service.state) ? service.usage : undefined;
  if (!usage) return undefined;
  const { history } = usage;
  const times = history.at;
  /** Both ways added up, reading by reading */
  const both = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] ?? 0));
  const flow = (
    id: TileItem,
    icon: React.ReactNode,
    measure: Measure,
    [first, second]: [
      { word: string; value?: number; values: number[] },
      { word: string; value?: number; values: number[] },
    ]
  ): Reading => ({
    id,
    icon,
    number: format.rate((first.value ?? 0) + (second.value ?? 0)),
    title: `${first.word} ${format.rate(first.value ?? 0)} · ${second.word} ${format.rate(second.value ?? 0)}`,
    values: both(first.values, second.values),
    times,
    measure,
  });
  return [
    {
      id: 'cpu',
      icon: <CpuIcon className='size-3.5' />,
      number: format.cpu(usage.cpu),
      values: history.cpu,
      times,
      measure: MEASURES.cpu,
    },
    {
      id: 'memory',
      icon: <MemoryStickIcon className='size-3.5' />,
      number: format.bytes(usage.memory),
      values: history.memory,
      times,
      measure: MEASURES.memory,
      // As it barely moves, to show its shape
      fit: true,
    },
    // None for one using another's network, as one behind a VPN does
    ...(usage.received !== undefined
      ? [
          flow(
            'network',
            <NetworkIcon className='size-3.5' />,
            MEASURES.network,
            [
              {
                word: words.down,
                value: usage.received,
                values: history.received,
              },
              { word: words.up, value: usage.sent, values: history.sent },
            ]
          ),
        ]
      : []),
    flow('disk', <ActivityIcon className='size-3.5' />, MEASURES.disk, [
      {
        word: words.write,
        value: usage.diskWritten,
        values: history.diskWritten,
      },
      { word: words.read, value: usage.diskRead, values: history.diskRead },
    ]),
  ];
}
