'use client';

import { useState } from 'react';

import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  CpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  NetworkIcon,
  ServerIcon,
} from 'lucide-react';

import {
  formatBytes,
  formatCpu,
  formatDuration,
  formatShare,
  MEASURES,
  type Measure,
} from '@/lib/format';
import type { Capacity, HostStats, Service } from '@/lib/types';

import { DiskDialog } from '@/components/disk-dialog';
import { HistoryChart } from '@/components/history-chart';
import { ProcessList } from '@/components/process-list';
import { TextSkeleton } from '@/components/skeletons';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * The server itself: what it is, then its CPU and processes, memory, disk
 * and network. Until it's been measured, each card is there with
 * placeholders where its numbers go, so nothing moves when they come.
 */
export function HostStatsBar({
  host,
  services,
  onOpen,
}: {
  /** None while it's first measured */
  host?: HostStats;
  /** For each process's container */
  services: Service[];
  onOpen: (service: Service) => void;
}) {
  return (
    <section
      aria-label='Server'
      aria-busy={!host}
      className='flex flex-col gap-3'
    >
      <ServerDetails host={host} />
      <LiveStats host={host} services={services} onOpen={onOpen} />
    </section>
  );
}

/** What the server is, label by label. */
const SERVER_DETAILS: [string, (host: HostStats) => string][] = [
  ['System', (h) => h.system.os],
  ['Kernel', (h) => `${h.system.kernel} (${h.system.architecture})`],
  ['Processor', (h) => `${h.system.cpuModel}, ${h.cores} cores`],
  ['Up for', (h) => formatDuration(h.system.uptime)],
  ['Load', (h) => h.system.load.map((l) => l.toFixed(2)).join('  ')],
  [
    'Swap',
    ({ system: { swap } }) =>
      swap.total > 0
        ? `${formatBytes(swap.used)} of ${formatBytes(swap.total)}`
        : 'None',
  ],
  ['Docker', (h) => h.system.docker],
  [
    'Containers',
    ({ system: s }) =>
      `${s.containers.running} running, ${s.containers.stopped} stopped, ${s.images} images`,
  ],
];

function ServerDetails({ host }: { host?: HostStats }) {
  return (
    <Card size='sm' className='px-3'>
      <div className='flex items-center gap-2'>
        <ServerIcon className='size-4 text-muted-foreground' />
        <span className='text-sm font-medium'>
          {host ? host.system.hostname : <TextSkeleton className='w-16' />}
        </span>
      </div>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4'>
        {SERVER_DETAILS.map(([label, value]) => (
          <div key={label} className='flex min-w-0 flex-col'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='truncate' title={host && value(host)}>
              {host ? value(host) : <TextSkeleton className='w-32' />}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function LiveStats({
  host,
  services,
  onOpen,
}: {
  host?: HostStats;
  services: Service[];
  onOpen: (service: Service) => void;
}) {
  const network = (
    <FlowStat
      icon={<NetworkIcon />}
      label='Network'
      times={host?.history.at}
      measure={MEASURES.network}
      flows={[
        {
          short: 'Down',
          label: 'Download',
          icon: <ArrowDownIcon />,
          value: host?.network.received,
          values: host?.history.received,
        },
        {
          short: 'Up',
          label: 'Upload',
          icon: <ArrowUpIcon />,
          value: host?.network.sent,
          values: host?.history.sent,
        },
      ]}
    />
  );
  const diskIo = (
    <FlowStat
      icon={<ActivityIcon />}
      label='Disk I/O'
      times={host?.history.at}
      measure={MEASURES.disk}
      // Down, then up, as on Network: written to the disk, then read off it
      flows={[
        {
          short: 'Write',
          label: 'Write',
          icon: <ArrowDownIcon />,
          value: host?.diskIo.written,
          values: host?.history.diskWritten,
        },
        {
          short: 'Read',
          label: 'Read',
          icon: <ArrowUpIcon />,
          value: host?.diskIo.read,
          values: host?.history.diskRead,
        },
      ]}
    />
  );

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      {/* CPU beside the processes using it, its graph as tall as their list */}
      <CpuStat host={host} />
      <ProcessList
        processes={host?.processes ?? []}
        services={services}
        onOpen={onOpen}
      />
      {/* Then memory, the disk twice over, and the network */}
      <Stat
        icon={<MemoryStickIcon />}
        label='Memory'
        detail={<Of capacity={host?.memory} />}
        value={host ? formatBytes(host.memory.used) : <ValueSkeleton />}
      >
        <Usage capacity={host?.memory} />
      </Stat>
      <DiskStat disk={host?.disk} />
      {diskIo}
      {network}
    </div>
  );
}

/** A big number to come, as tall as one. */
function ValueSkeleton() {
  return <TextSkeleton className='w-16' />;
}

/** "of 24 GB": what something's out of, as it's sold. */
function Of({ capacity }: { capacity?: Capacity }) {
  return (
    <span className='flex items-center gap-1 font-mono tabular-nums'>
      of{' '}
      {capacity ? (
        formatBytes(capacity.size)
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
function CpuStat({ host }: { host?: HostStats }) {
  const [shown, setShown] = useState<'total' | 'cores'>('total');
  const cores = host?.history.coreCpu ?? [];
  // The readings every line has: a core measured for less time has fewer
  const count = Math.min(
    host?.history.at.length ?? 0,
    ...(shown === 'cores' ? cores.map((c) => c.length) : [])
  );
  const total = {
    label: 'All cores',
    values: host?.history.cpu.slice(-count) ?? [],
    measure: MEASURES.cpu,
  };

  return (
    <Stat
      icon={<CpuIcon />}
      label='CPU'
      detail={
        <ToggleGroup
          type='single'
          size='sm'
          variant='outline'
          value={shown}
          disabled={!host}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setShown(v as typeof shown)}
          aria-label='Show in the graph'
        >
          <ToggleGroupItem value='total'>Total</ToggleGroupItem>
          <ToggleGroupItem value='cores'>
            {host ? `${host.cores} cores` : 'Cores'}
          </ToggleGroupItem>
        </ToggleGroup>
      }
      value={host ? formatCpu(host.cpu) : <ValueSkeleton />}
      fill
    >
      {host && (
        <HistoryChart
          label={
            shown === 'cores'
              ? 'CPU, each core and all together, over the last ten minutes'
              : 'CPU over the last ten minutes'
          }
          times={host.history.at.slice(-count)}
          series={
            shown === 'cores'
              ? [
                  total,
                  ...cores.map((values, i) => ({
                    label: `Core ${i}`,
                    values: values.slice(-count),
                    measure: MEASURES.cpu,
                    faint: true,
                  })),
                ]
              : [{ ...total, label: 'CPU' }]
          }
          className='h-full'
        />
      )}
    </Stat>
  );
}

/** The disk's use, which opens what takes it up. */
function DiskStat({ disk }: { disk?: Capacity }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type='button'
        disabled={!disk}
        onClick={() => setOpen(true)}
        aria-label='Disk: see what takes up space'
        className='group/stat flex rounded-lg text-left outline-none *:flex-1 *:transition-shadow focus-visible:ring-2 focus-visible:ring-ring enabled:*:group-hover/stat:ring-foreground/25'
      >
        <Stat
          icon={<HardDriveIcon />}
          label='Disk'
          detail={
            <span className='flex items-center gap-1'>
              <Of capacity={disk} />
              <ChevronRightIcon className='size-3.5' />
            </span>
          }
          value={disk ? formatBytes(disk.used) : <ValueSkeleton />}
        >
          <Usage capacity={disk} />
        </Stat>
      </button>
      {disk && (
        <DiskDialog open={open} onClose={() => setOpen(false)} disk={disk} />
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
  const graphed = series.map((s) => s.label.toLowerCase()).join(' and ');
  const measured = times !== undefined;

  return (
    <Stat
      icon={icon}
      label={label}
      detail={
        <ToggleGroup
          type='single'
          size='sm'
          variant='outline'
          value={shown}
          disabled={!measured}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setShown(v as typeof shown)}
          aria-label='Show in the graph'
        >
          <ToggleGroupItem value='0'>{flows[0].short}</ToggleGroupItem>
          <ToggleGroupItem value='1'>{flows[1].short}</ToggleGroupItem>
          <ToggleGroupItem value='both'>Both</ToggleGroupItem>
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
                  : `${f.label} ${measure.format(f.value)}`
              }
              // Icons a step smaller than the text's, which a filled one like
              // a book needs to look as big as a thin arrow beside a number
              className='flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:text-muted-foreground'
            >
              {f.icon}
              {f.value === undefined ? (
                <ValueSkeleton />
              ) : (
                measure.format(f.value)
              )}
            </span>
          ))}
        </span>
      }
    >
      {times && (
        <HistoryChart
          label={`${label} ${graphed} over the last ten minutes`}
          times={times}
          series={series}
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
  /** The graph takes the room the card has to spare, beside a taller one */
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
  const share =
    capacity && capacity.total > 0 ? (capacity.used / capacity.total) * 100 : 0;
  return (
    <div className='flex w-full items-center gap-3'>
      <Progress value={share} aria-label='Used' className='flex-1' />
      <span className='font-mono text-muted-foreground tabular-nums'>
        {capacity ? (
          formatShare(capacity.used, capacity.total)
        ) : (
          <TextSkeleton className='w-7' />
        )}
      </span>
    </div>
  );
}
