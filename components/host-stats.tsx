'use client';

import { useState } from 'react';

import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  CpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  NetworkIcon,
  PenLineIcon,
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
import type { HostStats, Service } from '@/lib/types';

import { HistoryChart } from '@/components/history-chart';
import { ProcessList } from '@/components/process-list';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** The server itself: what it is, then its CPU and processes, memory, disk and network. */
export function HostStatsBar({
  host,
  services,
  onOpen,
}: {
  host: HostStats;
  /** For each process's container */
  services: Service[];
  onOpen: (service: Service) => void;
}) {
  return (
    <section aria-label='Server' className='flex flex-col gap-3'>
      <ServerDetails host={host} />
      <LiveStats host={host} services={services} onOpen={onOpen} />
    </section>
  );
}

function ServerDetails({ host }: { host: HostStats }) {
  const s = host.system;
  const details = [
    ['System', s.os],
    ['Kernel', `${s.kernel} (${s.architecture})`],
    ['Processor', `${s.cpuModel}, ${host.cores} cores`],
    ['Up for', formatDuration(s.uptime)],
    ['Load', s.load.map((l) => l.toFixed(2)).join('  ')],
    [
      'Swap',
      s.swap.total > 0
        ? `${formatBytes(s.swap.used)} of ${formatBytes(s.swap.total)}`
        : 'None',
    ],
    ['Docker', s.docker],
    [
      'Containers',
      `${s.containers.running} running, ${s.containers.stopped} stopped, ${s.images} images`,
    ],
  ];
  return (
    <Card size='sm' className='px-3'>
      <div className='flex items-center gap-2'>
        <ServerIcon className='size-4 text-muted-foreground' />
        <span className='text-sm font-medium'>{s.hostname}</span>
      </div>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4'>
        {details.map(([label, value]) => (
          <div key={label} className='flex min-w-0 flex-col'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='truncate' title={value}>
              {value}
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
  host: HostStats;
  services: Service[];
  onOpen: (service: Service) => void;
}) {
  const network = (
    <FlowStat
      icon={<NetworkIcon />}
      label='Network'
      times={host.history.at}
      measure={MEASURES.network}
      flows={[
        {
          short: 'Down',
          label: 'Download',
          icon: <ArrowDownIcon />,
          value: host.network.received,
          values: host.history.received,
        },
        {
          short: 'Up',
          label: 'Upload',
          icon: <ArrowUpIcon />,
          value: host.network.sent,
          values: host.history.sent,
        },
      ]}
    />
  );
  const diskIo = (
    <FlowStat
      icon={<ActivityIcon />}
      label='Disk I/O'
      times={host.history.at}
      measure={MEASURES.disk}
      flows={[
        {
          short: 'Read',
          label: 'Read',
          icon: <BookOpenIcon />,
          value: host.diskIo.read,
          values: host.history.diskRead,
        },
        {
          short: 'Write',
          label: 'Write',
          icon: <PenLineIcon />,
          value: host.diskIo.written,
          values: host.history.diskWritten,
        },
      ]}
    />
  );

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      {/* CPU beside the processes using it, its graph as tall as their list */}
      <CpuStat host={host} />
      <ProcessList
        processes={host.processes}
        services={services}
        onOpen={onOpen}
      />
      {/* Then memory, the disk twice over, and the network */}
      <Stat
        icon={<MemoryStickIcon />}
        label='Memory'
        detail={`of ${formatBytes(host.memory.size)}`}
        value={formatBytes(host.memory.used)}
      >
        <Usage used={host.memory.used} total={host.memory.total} />
      </Stat>
      <Stat
        icon={<HardDriveIcon />}
        label='Disk'
        detail={`of ${formatBytes(host.disk.size)}`}
        value={formatBytes(host.disk.used)}
      >
        <Usage used={host.disk.used} total={host.disk.total} />
      </Stat>
      {diskIo}
      {network}
    </div>
  );
}

/**
 * The CPU over all cores, as a graph of their total, or with each core's own
 * line behind it, faint, to see how they share the work.
 */
function CpuStat({ host }: { host: HostStats }) {
  const [shown, setShown] = useState<'total' | 'cores'>('total');
  const cores = host.history.coreCpu ?? [];
  // The readings every line has: a core measured for less time has fewer
  const count = Math.min(
    host.history.at.length,
    ...(shown === 'cores' ? cores.map((c) => c.length) : [])
  );
  const total = {
    label: 'All cores',
    values: host.history.cpu.slice(-count),
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
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && setShown(v as typeof shown)}
          aria-label='Show in the graph'
        >
          <ToggleGroupItem value='total'>Total</ToggleGroupItem>
          <ToggleGroupItem value='cores'>{host.cores} cores</ToggleGroupItem>
        </ToggleGroup>
      }
      value={formatCpu(host.cpu)}
      fill
    >
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
    </Stat>
  );
}

/** One way something flows: data down or up, read or written. */
type Flow = {
  /** For the switch above the graph */
  short: string;
  /** For the graph's tooltip and screen readers */
  label: string;
  icon: React.ReactNode;
  /** Now */
  value: number;
  /** The last ten minutes */
  values: number[];
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
  times: number[];
  measure: Measure;
  flows: [Flow, Flow];
}) {
  const [shown, setShown] = useState<'0' | '1' | 'both'>('both');
  const [first, second] = flows.map((f) => ({
    label: f.label,
    values: f.values,
    measure,
  }));
  const series = {
    '0': [first],
    '1': [second],
    both: [first, { ...second, dashed: true }],
  }[shown];
  const graphed = series.map((s) => s.label.toLowerCase()).join(' and ');

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
              aria-label={`${f.label} ${measure.format(f.value)}`}
              // Icons a step smaller than the text's, which a filled one like
              // a book needs to look as big as a thin arrow beside a number
              className='flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:text-muted-foreground'
            >
              {f.icon}
              {measure.format(f.value)}
            </span>
          ))}
        </span>
      }
    >
      <HistoryChart
        label={`${label} ${graphed} over the last ten minutes`}
        times={times}
        series={series}
      />
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

/** How full something is, as a bar with the share beside it. */
function Usage({ used, total }: { used: number; total: number }) {
  const share = total > 0 ? (used / total) * 100 : 0;
  return (
    <div className='flex w-full items-center gap-3'>
      <Progress value={share} aria-label='Used' className='flex-1' />
      <span className='font-mono text-muted-foreground tabular-nums'>
        {formatShare(used, total)}
      </span>
    </div>
  );
}
