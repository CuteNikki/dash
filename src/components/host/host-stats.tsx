'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  ActivityIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpCircleIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CpuIcon,
  HardDriveIcon,
  HistoryIcon,
  MemoryStickIcon,
  NetworkIcon,
  ServerIcon,
} from 'lucide-react';

import type { Format } from '@/i18n/format';
import { useFormat } from '@/i18n/use-format';

import { MEASURES, processorName, type Measure } from '@/lib/format';
import type { HostTileKey } from '@/lib/host/host-tiles';
import type { Capacity, HostStats, Service, SystemUpdates } from '@/lib/types';
import { cn } from '@/lib/utils';

import { BackupsDialog } from '@/components/backups/backups-dialog';
import { HistoryChart } from '@/components/charts/history-chart';
import { TextSkeleton } from '@/components/common/skeletons';
import { DiskDialog } from '@/components/host/disk-dialog';
import { HistoryDialog } from '@/components/host/history-dialog';
import { ProcessList } from '@/components/host/process-list';
import { Button, ButtonLabel } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * One of the server's tiles: what it is, its CPU, processes, memory, disk
 * or network. Until it's been measured, each is there with placeholders
 * where its numbers go, so nothing moves when they come.
 */
export function HostTileContent({
  tile,
  host,
  services,
  onOpenAction,
  system,
  onSystemAction,
}: {
  tile: HostTileKey;
  /** None while it's first measured */
  host?: HostStats;
  /** For each process's container */
  services: Service[];
  onOpenAction: (service: Service) => void;
  /** Its own updates, Ubuntu's, once they've been looked at */
  system?: SystemUpdates;
  onSystemAction: () => void;
}) {
  const format = useFormat();
  const t = useTranslations('host');
  return render(tile);

  function render(key: HostTileKey) {
    switch (key) {
      case 'server':
        return (
          <ServerDetails
            host={host}
            system={system}
            onSystem={onSystemAction}
          />
        );
      case 'cpu':
        return <CpuStat host={host} />;
      case 'processes':
        return (
          <ProcessList
            processes={host?.processes ?? []}
            services={services}
            onOpenAction={onOpenAction}
          />
        );
      case 'memory':
        return (
          <Stat
            icon={<MemoryStickIcon />}
            label={t('memory')}
            detail={<Of capacity={host?.memory} />}
            value={host ? format.bytes(host.memory.used) : <ValueSkeleton />}
          >
            <Usage capacity={host?.memory} />
          </Stat>
        );
      case 'disk':
        return <DiskStat disk={host?.disk} />;
      case 'disk-io':
        return (
          <FlowStat
            icon={<ActivityIcon />}
            label={t('diskIo')}
            times={host?.history.at}
            measure={MEASURES.disk}
            // Down, then up, as on Network: written to the disk, then read off it
            flows={[
              {
                short: t('write'),
                label: t('write'),
                icon: <ArrowDownIcon />,
                value: host?.diskIo.written,
                values: host?.history.diskWritten,
              },
              {
                short: t('read'),
                label: t('read'),
                icon: <ArrowUpIcon />,
                value: host?.diskIo.read,
                values: host?.history.diskRead,
              },
            ]}
          />
        );
      case 'network':
        return (
          <FlowStat
            icon={<NetworkIcon />}
            label={t('network')}
            times={host?.history.at}
            measure={MEASURES.network}
            flows={[
              {
                short: t('down'),
                label: t('download'),
                icon: <ArrowDownIcon />,
                value: host?.network.received,
                values: host?.history.received,
              },
              {
                short: t('up'),
                label: t('upload'),
                icon: <ArrowUpIcon />,
                value: host?.network.sent,
                values: host?.history.sent,
              },
            ]}
          />
        );
    }
  }
}

/**
 * The server tile's buttons: small beside its details on a wide tile, and
 * on a narrow one, as on a phone, where they're tapped, the header's size.
 */
const TILE_BUTTON =
  "@max-md:h-7 @max-md:gap-1 @max-md:rounded-md @max-md:text-xs @max-md:[&_svg:not([class*='size-'])]:size-3.5";

/** What the server is, label by label, in the page's language. */
function serverDetails(
  t: ReturnType<typeof useTranslations<'host'>>,
  format: Format
): [string, (host: HostStats) => string, ((host: HostStats) => string)?][] {
  return [
    [t('system'), (h) => h.system.os],
    [t('kernel'), (h) => `${h.system.kernel} (${h.system.architecture})`],
    [
      t('processor'),
      (h) =>
        t('processorThreads', {
          model: processorName(h.system.cpuModel),
          count: h.cores,
        }),
      // The name in full when it's pointed at, as the system gives it
      (h) => h.system.cpuModel,
    ],
    [t('upFor'), (h) => format.duration(h.system.uptime)],
    [t('load'), (h) => h.system.load.map((l) => format.fixed(l, 2)).join('  ')],
    [
      t('swap'),
      ({ system: { swap } }) =>
        swap.total > 0
          ? t('usedOf', {
              used: format.bytes(swap.used),
              size: format.bytes(swap.total),
            })
          : t('none'),
    ],
    ['Docker', (h) => h.system.docker],
    [
      t('containers'),
      ({ system: s }) =>
        t('containerCounts', {
          running: s.containers.running,
          stopped: s.containers.stopped,
          images: s.images,
        }),
    ],
  ];
}

function ServerDetails({
  host,
  system,
  onSystem,
}: {
  host?: HostStats;
  system?: SystemUpdates;
  onSystem: () => void;
}) {
  const format = useFormat();
  const t = useTranslations('host');
  const [history, setHistory] = useState(false);
  const [backups, setBackups] = useState(false);
  return (
    // Its details in as many columns as its own width has room for
    <Card size='sm' className='@container px-3'>
      <div className='flex items-center gap-2'>
        <ServerIcon className='size-4 shrink-0 text-muted-foreground' />
        <span className='mr-auto min-w-0 truncate text-sm font-medium'>
          {host ? host.system.hostname : <TextSkeleton className='w-16' />}
        </span>
        <Button
          variant='outline'
          size='xs'
          onClick={() => setHistory(true)}
          aria-label={t('history')}
          className={cn(TILE_BUTTON, 'text-muted-foreground')}
        >
          <HistoryIcon />
          {/* Its icon alone on a narrow tile, so the server's name has the room */}
          <ButtonLabel hideOn='tile'>{t('history')}</ButtonLabel>
        </Button>
        <Button
          variant='outline'
          size='xs'
          onClick={() => setBackups(true)}
          aria-label={t('backups')}
          className={cn(TILE_BUTTON, 'text-muted-foreground')}
        >
          <ArchiveIcon />
          <ButtonLabel hideOn='tile'>{t('backups')}</ButtonLabel>
        </Button>
        {system && <SystemButton system={system} onClick={onSystem} />}
      </div>
      <HistoryDialog
        open={history}
        host={host}
        onCloseAction={() => setHistory(false)}
      />
      <BackupsDialog open={backups} onCloseAction={() => setBackups(false)} />
      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2 @3xl:grid-cols-4 @7xl:grid-cols-8'>
        {serverDetails(t, format).map(([label, value, full = value]) => (
          <div key={label} className='flex min-w-0 flex-col'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='truncate' title={host && full(host)}>
              {host ? value(host) : <TextSkeleton className='w-32' />}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * The server's own updates in a few words, to open them: "30 updates, 2
 * security", "restart needed", or that it's up to date.
 */
function SystemButton({
  system,
  onClick,
}: {
  system: SystemUpdates;
  onClick: () => void;
}) {
  const t = useTranslations('host');
  // What an upgrade installs, not what apt holds back
  const waiting = system.packages.filter((p) => !p.phased && !p.keptBack);
  const count = waiting.length;
  const security = waiting.filter((p) => p.security).length;
  const words = [
    system.upgrading
      ? t('upgrading')
      : count
        ? t('updateCount', { count })
        : t('upToDate'),
    security > 0 && t('security', { count: security }),
    system.reboot && t('restartNeeded'),
  ].filter(Boolean);
  return (
    <Button
      variant='outline'
      size='xs'
      onClick={onClick}
      aria-label={t('systemUpdates', { words: words.join(', ') })}
      className={cn(
        TILE_BUTTON,
        system.reboot
          ? 'text-warning hover:text-warning'
          : count
            ? 'text-update hover:text-update'
            : 'text-muted-foreground'
      )}
    >
      {count > 0 || system.reboot ? <ArrowUpCircleIcon /> : <CheckIcon />}
      {/* On a narrow tile, as History is, its icon and how many wait, its
          color saying whether a restart's needed */}
      {count > 0 ? (
        <>
          <span className='@max-md:hidden'>{words.join(', ')}</span>
          <span className='font-mono tabular-nums @md:hidden'>{count}</span>
        </>
      ) : (
        // Nothing waiting: its icon alone, square as History is
        <ButtonLabel hideOn='tile'>{words.join(', ')}</ButtonLabel>
      )}
    </Button>
  );
}

/** A big number to come, as tall as one. */
function ValueSkeleton() {
  return <TextSkeleton className='w-16' />;
}

/** "of 24 GB": what something's out of, as it's sold. */
function Of({ capacity }: { capacity?: Capacity }) {
  const format = useFormat();
  const t = useTranslations('host');
  return (
    <span className='flex items-center gap-1 font-mono tabular-nums'>
      {t('of')}{' '}
      {capacity ? (
        format.bytes(capacity.size)
      ) : (
        <TextSkeleton className='w-10' />
      )}
    </span>
  );
}

/**
 * The CPU over all cores, as a graph of their total, or with each core's own
 * line behind it, faint, to see how they share the work.
 */
/** The least or most of the cores' readings at each of the last count moments. */
function spread(
  cores: number[][],
  count: number,
  pick: (...values: number[]) => number
) {
  const recent = cores.map((c) => c.slice(-count));
  return Array.from({ length: count }, (_, i) =>
    pick(...recent.map((c) => c[i]))
  );
}

function CpuStat({ host }: { host?: HostStats }) {
  const format = useFormat();
  const t = useTranslations('host');
  const [shown, setShown] = useState<'total' | 'cores'>('total');
  const cores = host?.history.coreCpu ?? [];
  // The readings every line has: a core measured for less time has fewer
  const count = Math.min(
    host?.history.at.length ?? 0,
    ...(shown === 'cores' ? cores.map((c) => c.length) : [])
  );
  const total = {
    label: t('allThreads'),
    values: host?.history.cpu.slice(-count) ?? [],
    measure: MEASURES.serverCpu,
  };

  return (
    <Stat
      icon={<CpuIcon />}
      label={t('cpu')}
      detail={
        <ToggleGroup
          type='single'
          size='sm'
          variant='segmented'
          value={shown}
          disabled={!host}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setShown(v as typeof shown)}
          aria-label={t('showInGraph')}
        >
          <ToggleGroupItem value='total'>{t('total')}</ToggleGroupItem>
          <ToggleGroupItem value='cores'>{t('perThread')}</ToggleGroupItem>
        </ToggleGroup>
      }
      value={host ? format.cpu(host.cpu) : <ValueSkeleton />}
      fill
    >
      {host && (
        <HistoryChart
          label={shown === 'cores' ? t('cpuEachThread') : t('cpuChart')}
          times={host.history.at.slice(-count)}
          series={[shown === 'cores' ? total : { ...total, label: t('cpu') }]}
          // Each core as one soft band, from the least busy to the busiest at
          // each moment: twenty lines would only tangle
          band={
            shown === 'cores' && cores.length
              ? {
                  low: spread(cores, count, Math.min),
                  high: spread(cores, count, Math.max),
                  lowLabel: t('leastBusyThread'),
                  highLabel: t('busiestThread'),
                  // Each one's reading too, when the chart's pointed at
                  members: cores.map((values, i) => ({
                    label: t('thread', { number: i }),
                    short: String(i),
                    values: values.slice(-count),
                  })),
                }
              : undefined
          }
          className='h-full'
        />
      )}
    </Stat>
  );
}

/** The disk's use, which opens what takes it up. */
function DiskStat({ disk }: { disk?: Capacity }) {
  const format = useFormat();
  const t = useTranslations('host');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type='button'
        disabled={!disk}
        onClick={() => setOpen(true)}
        aria-label={t('diskOpen')}
        className='group/stat flex rounded-xl text-left outline-none *:flex-1 *:transition-shadow focus-visible:ring-2 focus-visible:ring-ring enabled:*:group-hover/stat:ring-foreground/25'
      >
        <Stat
          icon={<HardDriveIcon />}
          label={t('disk')}
          detail={
            <span className='flex items-center gap-1'>
              <Of capacity={disk} />
              <ChevronRightIcon className='size-3.5' />
            </span>
          }
          value={disk ? format.bytes(disk.used) : <ValueSkeleton />}
        >
          <Usage capacity={disk} />
        </Stat>
      </button>
      {disk && (
        <DiskDialog
          open={open}
          onCloseAction={() => setOpen(false)}
          disk={disk}
        />
      )}
    </>
  );
}

/** One way something flows: data down or up, read or written. */
type Flow = {
  /** For the switch above the graph */
  short: string;
  /** For the graph's tooltip and screen readers */
  label: string;
  icon: React.ReactNode;
  /** Now; none until it's measured */
  value?: number;
  /** The last ten minutes */
  values?: number[];
};

/**
 * Something that flows two ways, network or disk: both rates now, and a
 * graph of either or both, the second dashed when they share it.
 */
function FlowStat({
  icon,
  label,
  times,
  measure,
  flows,
}: {
  icon: React.ReactNode;
  label: string;
  times?: number[];
  measure: Measure;
  flows: [Flow, Flow];
}) {
  const t = useTranslations('host');
  const format = useFormat();
  const [shown, setShown] = useState<'0' | '1' | 'both'>('both');
  const [first, second] = flows.map((f) => ({
    label: f.label,
    values: f.values ?? [],
    measure,
  }));
  const series = {
    '0': [first],
    '1': [second],
    both: [first, { ...second, dashed: true }],
  }[shown];
  const graphed = series.map((s) => s.label);
  const measured = times !== undefined;

  return (
    <Stat
      icon={icon}
      label={label}
      fill
      detail={
        <ToggleGroup
          type='single'
          size='sm'
          variant='segmented'
          value={shown}
          disabled={!measured}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setShown(v as typeof shown)}
          aria-label={t('showInGraph')}
        >
          <ToggleGroupItem value='0'>{flows[0].short}</ToggleGroupItem>
          <ToggleGroupItem value='1'>{flows[1].short}</ToggleGroupItem>
          <ToggleGroupItem value='both'>{t('both')}</ToggleGroupItem>
        </ToggleGroup>
      }
      value={
        <span className='flex items-center gap-4'>
          {flows.map((f) => (
            <span
              key={f.label}
              aria-label={
                f.value === undefined
                  ? undefined
                  : `${f.label} ${measure.format(f.value, format)}`
              }
              // Icons a step smaller than the text's, which a filled one like
              // a book needs to look as big as a thin arrow beside a number
              className='flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:text-muted-foreground'
            >
              {f.icon}
              {f.value === undefined ? (
                <ValueSkeleton />
              ) : (
                measure.format(f.value, format)
              )}
            </span>
          ))}
        </span>
      }
    >
      {times && (
        <HistoryChart
          label={t('flowChart', {
            label,
            first: graphed[0],
            second: graphed[1] ?? '',
            count: graphed.length,
          })}
          times={times}
          series={series}
          className='h-full'
        />
      )}
    </Stat>
  );
}

function Stat({
  icon,
  label,
  detail,
  value,
  fill,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail: React.ReactNode;
  value: React.ReactNode;
  /** The graph takes the room the card has to spare, in a taller tile */
  fill?: boolean;
  /** A graph or a bar along the bottom */
  children: React.ReactNode;
}) {
  return (
    <Card size='sm' className='px-3'>
      <div className='flex h-6 items-center gap-2 text-muted-foreground [&_svg:not([class*=size-])]:size-4'>
        {icon}
        <span className='mr-auto'>{label}</span>
        {typeof detail === 'string' ? (
          <span className='font-mono tabular-nums'>{detail}</span>
        ) : (
          detail
        )}
      </div>
      <div className='font-mono text-lg font-medium tabular-nums'>{value}</div>
      {fill ? (
        // Laid over the room to spare, so the graph fills the height the row
        // has without adding any of its own
        <div className='relative min-h-6 flex-1'>
          <div className='absolute inset-0 flex'>{children}</div>
        </div>
      ) : (
        <div className='mt-auto flex h-6 items-end'>{children}</div>
      )}
    </Card>
  );
}

/** How full something is, as a bar with the share beside it; empty until it's known. */
function Usage({ capacity }: { capacity?: Capacity }) {
  const format = useFormat();
  const t = useTranslations('host');
  const share =
    capacity && capacity.total > 0 ? (capacity.used / capacity.total) * 100 : 0;
  return (
    <div className='flex w-full items-center gap-3'>
      <Progress value={share} aria-label={t('used')} className='flex-1' />
      <span className='font-mono text-muted-foreground tabular-nums'>
        {capacity ? (
          format.share(capacity.used, capacity.total)
        ) : (
          <TextSkeleton className='w-7' />
        )}
      </span>
    </div>
  );
}
