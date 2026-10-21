'use client';

import { useMemo, useState } from 'react';

import { ArrowDownIcon, ListIcon, SearchIcon } from 'lucide-react';

import { formatBytes, formatCpu } from '@/lib/format';
import type { HostProcess, Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/scroll-fade';
import { ServiceIcon } from '@/components/service-icon';
import { Card } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

type SortKey = 'cpu' | 'memory';

/**
 * The server's processes, busiest first: what each is, the container it runs
 * in (which opens that service), and its CPU and memory. Sorted by either,
 * filtered by name, command or container, scrolling past the first few.
 */
export function ProcessList({
  processes,
  services,
  onOpen,
}: {
  processes: HostProcess[];
  services: Service[];
  onOpen: (service: Service) => void;
}) {
  const [sort, setSort] = useState<SortKey>('cpu');
  const [filter, setFilter] = useState('');
  const byContainer = useMemo(
    () => new Map(services.map((s) => [s.containerId, s])),
    [services]
  );
  const serviceOf = (p: HostProcess) =>
    p.containerId ? byContainer.get(p.containerId) : undefined;

  const query = filter.trim().toLowerCase();
  const shown = processes
    .filter(
      (p) =>
        !query ||
        [p.name, p.command, serviceOf(p)?.name].some((text) =>
          text?.toLowerCase().includes(query)
        )
    )
    .sort((a, b) => b[sort] - a[sort] || b.cpu - a.cpu);

  return (
    // Its columns follow the card's own width: PID shows once there's room,
    // and a container's name beside its icon, so the process always has most
    <Card size='sm' className='@container px-3 lg:col-span-3'>
      {/* The title, the filter in the middle, and how many there are */}
      <div className='grid h-6 grid-cols-[1fr_auto_1fr] items-center gap-2 text-muted-foreground [&_svg:not([class*=size-])]:size-4'>
        <span className='flex items-center gap-2'>
          <ListIcon />
          Processes
        </span>
        <InputGroup className='h-6 w-48'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder='Filter'
            aria-label='Filter processes'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </InputGroup>
        <span className='justify-self-end font-mono tabular-nums'>
          {query
            ? `${shown.length} of ${processes.length}`
            : `${processes.length} total`}
        </span>
      </div>
      {processes.length === 0 ? (
        <p className='text-muted-foreground'>Measuring…</p>
      ) : (
        // Nine lines whatever the filter leaves, so the page doesn't shift
        // while typing: the headings and eight processes, the rest a scroll
        // away, faded at the edges while there's more. The scrollbar's room is
        // kept when it's gone, so the columns stay put too; the headings do,
        // so the top fade starts a line down
        <ScrollFade
          className='h-[9lh] [scrollbar-gutter:stable] overflow-auto'
          fadeTop='top-[1lh]'
        >
          {/* A gap after every column but the last, so none run into the next */}
          <table className='w-full table-fixed [&_td:not(:last-child)]:pr-4 [&_th:not(:last-child)]:pr-4'>
            <thead className='sticky top-0 bg-card text-left text-muted-foreground'>
              <tr>
                <th className='font-normal'>Process</th>
                <th className='hidden w-20 font-normal @2xl:table-cell'>PID</th>
                <th className='w-8 font-normal @lg:w-40'>
                  <span className='hidden @lg:inline'>Container</span>
                </th>
                <SortHeading by='cpu' sort={sort} onSort={setSort}>
                  CPU
                </SortHeading>
                <SortHeading by='memory' sort={sort} onSort={setSort}>
                  Memory
                </SortHeading>
              </tr>
            </thead>
            <tbody className='tabular-nums'>
              {shown.map((p) => {
                const service = serviceOf(p);
                return (
                  <tr key={p.pid}>
                    <td className='truncate' title={p.command || p.name}>
                      <span className='font-mono'>{p.name}</span>
                      {p.command && (
                        <span className='ml-2 text-muted-foreground'>
                          {p.command}
                        </span>
                      )}
                    </td>
                    <td className='hidden font-mono text-muted-foreground @2xl:table-cell'>
                      {p.pid}
                    </td>
                    <td>
                      {service && (
                        <button
                          type='button'
                          title={service.name}
                          aria-label={`Open ${service.name}`}
                          onClick={() => onOpen(service)}
                          className='flex max-w-full items-center gap-1.5 rounded-sm hover:underline'
                        >
                          <ServiceIcon
                            icon={service.icon}
                            name={service.name}
                            variants={service.iconVariants}
                            missing={service.iconMissing}
                            className='size-3.5 shrink-0'
                          />
                          <span className='hidden truncate @lg:inline'>
                            {service.name}
                          </span>
                        </button>
                      )}
                    </td>
                    <td className='text-right font-mono'>{formatCpu(p.cpu)}</td>
                    <td className='text-right font-mono'>
                      {formatBytes(p.memory)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className='text-muted-foreground'>No processes match.</p>
          )}
        </ScrollFade>
      )}
    </Card>
  );
}

/** A column's heading that sorts by it, most first, marked while it does. */
function SortHeading({
  by,
  sort,
  onSort,
  children,
}: {
  by: SortKey;
  sort: SortKey;
  onSort: (by: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sort === by;
  return (
    <th
      aria-sort={active ? 'descending' : undefined}
      className='w-20 text-right font-normal'
    >
      <button
        type='button'
        onClick={() => onSort(by)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          active && 'text-foreground'
        )}
      >
        {active && <ArrowDownIcon className='size-3' />}
        {children}
      </button>
    </th>
  );
}
