import {
  ArrowDownIcon,
  ArrowUpIcon,
  CpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  NetworkIcon,
} from 'lucide-react';

import { formatBytes, formatCpu, formatRate, formatShare } from '@/lib/format';
import type { HostStats } from '@/lib/types';

import { Sparkline } from '@/components/sparkline';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

/** The server itself: CPU, memory, disk and network, above its services. */
export function HostStatsBar({ host }: { host: HostStats }) {
  return (
    <section
      aria-label='Server'
      className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'
    >
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
        <Sparkline values={host.history.received} className='h-6 w-full' />
      </Stat>
    </section>
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
      <div className='flex items-center gap-2 leading-control text-muted-foreground [&_svg:not([class*=size-])]:size-4'>
        {icon}
        <span className='mr-auto'>{label}</span>
        <span className='font-mono tabular-nums'>{detail}</span>
      </div>
      <div className='font-mono text-lg leading-control font-medium tabular-nums'>
        {value}
      </div>
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
