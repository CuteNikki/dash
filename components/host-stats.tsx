import {
  ArrowDownIcon,
  ArrowUpIcon,
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
  formatRate,
  formatShare,
} from '@/lib/format';
import type { HostStats } from '@/lib/types';

import { Sparkline } from '@/components/sparkline';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

/** The server itself: what it is, then its CPU, memory, disk and network. */
export function HostStatsBar({ host }: { host: HostStats }) {
  return (
    <section aria-label='Server' className='flex flex-col gap-3'>
      <ServerDetails host={host} />
      <LiveStats host={host} />
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

function LiveStats({ host }: { host: HostStats }) {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      <Stat
        icon={<CpuIcon />}
        label='CPU'
        detail={`${host.cores} cores`}
        value={formatCpu(host.cpu)}
      >
        <Sparkline values={host.history.cpu} className='h-6 w-full' />
      </Stat>
      <Stat
        icon={<MemoryStickIcon />}
        label='Memory'
        detail={`of ${formatBytes(host.memory.total)}`}
        value={formatBytes(host.memory.used)}
      >
        <Usage used={host.memory.used} total={host.memory.total} />
      </Stat>
      <Stat
        icon={<HardDriveIcon />}
        label='Disk'
        detail={`of ${formatBytes(host.disk.total)}`}
        value={formatBytes(host.disk.used)}
      >
        <Usage used={host.disk.used} total={host.disk.total} />
      </Stat>
      <Stat
        icon={<NetworkIcon />}
        label='Network'
        detail={
          <span className='flex items-center gap-1'>
            <ArrowUpIcon className='size-3' />
            {formatRate(host.network.sent)}
          </span>
        }
        value={
          <span className='flex items-center gap-1'>
            <ArrowDownIcon className='size-4 text-muted-foreground' />
            {formatRate(host.network.received)}
          </span>
        }
      >
        <Sparkline
          values={host.history.received}
          second={host.history.sent}
          className='h-6 w-full'
        />
      </Stat>
    </div>
  );
}

function Stat({
  icon,
  label,
  detail,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail: React.ReactNode;
  value: React.ReactNode;
  /** A graph or a bar along the bottom */
  children: React.ReactNode;
}) {
  return (
    <Card size='sm' className='px-3'>
      <div className='flex items-center gap-2 text-muted-foreground [&_svg:not([class*=size-])]:size-4'>
        {icon}
        <span className='mr-auto'>{label}</span>
        <span className='font-mono tabular-nums'>{detail}</span>
      </div>
      <div className='font-mono text-lg font-medium tabular-nums'>{value}</div>
      <div className='mt-auto flex h-6 items-end'>{children}</div>
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
