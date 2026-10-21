'use client';

import { useMemo, useState } from 'react';

import { ArrowDownIcon, ListIcon, SearchIcon } from 'lucide-react';

import { formatBytes, formatCpu } from '@/lib/format';
import type { HostProcess, Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ProcessDialog } from '@/components/process-dialog';
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
 * Picking one shows it closely, to stop it.
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
  // The process picked to look at closely, by its id
  const [picked, setPicked] = useState<number>();
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
      {/* The title, the filter in the middle, and how many there are; on a
          narrow card, the filter goes on a line of its own below */}
      <div className='grid grid-cols-[1fr_auto] items-center gap-2 text-muted-foreground @md:h-6 @md:grid-cols-[1fr_auto_1fr] [&_svg:not([class*=size-])]:size-4'>
        <span className='flex items-center gap-2'>
          <ListIcon />
          Processes
        </span>
        <InputGroup className='order-last col-span-2 h-6 @md:order-none @md:col-span-1 @md:w-48'>
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
        // Seven lines whatever the filter leaves, so the page doesn't shift
        // while typing: the headings and six processes, the rest a scroll
        // away, faded at the edges while there's more. The scrollbar's room is
        // kept when it's gone, so the columns stay put too; the headings do,
        // so the top fade starts a line down
        <ScrollFade
          className='h-[7lh] [scrollbar-gutter:stable] overflow-auto'
          fadeTop='top-[1lh]'
        >
          {/* A gap after every column but the last, so none run into the
              next, and room at each row's ends for its rounded highlight */}
          <table className='w-full table-fixed [&_td:first-child]:rounded-l-md [&_td:first-child]:pl-2 [&_td:last-child]:rounded-r-md [&_td:last-child]:pr-2 [&_td:not(:last-child)]:pr-4 [&_th:first-child]:pl-2 [&_th:last-child]:pr-2 [&_th:not(:last-child)]:pr-4'>
            <thead className='sticky top-0 bg-card text-left text-muted-foreground'>
              <tr>
                <th className='font-normal'>Process</th>
                <th className='hidden w-20 font-normal @2xl:table-cell'>PID</th>
                <th className='w-8 font-normal @lg:w-40'>
                  <span className='hidden @lg:inline'>Container</span>
                </th>
                <SortHeading
                  by='cpu'
                  sort={sort}
                  onSort={setSort}
                  className='w-16'
                >
                  CPU
                </SortHeading>
                <SortHeading
                  by='memory'
                  sort={sort}
                  onSort={setSort}
                  className='w-18'
                >
                  Memory
                </SortHeading>
              </tr>
            </thead>
            <tbody className='tabular-nums'>
              {shown.map((p) => {
                const service = serviceOf(p);
                return (
                  <tr
                    key={p.pid}
                    tabIndex={0}
                    aria-label={`${p.name} ${p.pid}`}
                    onClick={() => setPicked(p.pid)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      setPicked(p.pid);
                    }}
                    className='cursor-pointer outline-none hover:bg-muted focus-visible:bg-muted'
                  >
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
                          onClick={(e) => {
                            // Its service, not the process's details
                            e.stopPropagation();
                            onOpen(service);
                          }}
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
      <ProcessDialog
        process={processes.find((p) => p.pid === picked)}
        services={services}
        onOpenService={onOpen}
        onClose={() => setPicked(undefined)}
      />
    </Card>
  );
}

/** A column's heading that sorts by it, most first, marked while it does. */
function SortHeading({
  by,
  sort,
  onSort,
  className,
  children,
}: {
  by: SortKey;
  sort: SortKey;
  onSort: (by: SortKey) => void;
  /** Its width: as wide as its numbers, so it doesn't stand apart from the rest */
  className: string;
  children: React.ReactNode;
}) {
  const active = sort === by;
  return (
    <th
      aria-sort={active ? 'descending' : undefined}
      className={cn('text-right font-normal', className)}
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
