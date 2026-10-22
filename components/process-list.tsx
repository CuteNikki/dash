'use client';

import { useMemo, useState } from 'react';

import { ArrowDownIcon, ListIcon, SearchIcon } from 'lucide-react';

import { formatBytes, formatCpu } from '@/lib/format';
import type { HostProcess, Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ProcessDialog } from '@/components/process-dialog';
import { ScrollFade } from '@/components/scroll-fade';
import { ServiceIcon } from '@/components/service-icon';
import { TextSkeleton } from '@/components/skeletons';
import { Card } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

type SortKey = 'cpu' | 'memory';

/** Placeholder rows while the first measurement's under way: as many as show. */
const SKELETON_ROWS = 6;
/** Name lengths that look like processes', never all alike. */
const NAME_WIDTHS = ['w-40', 'w-24', 'w-56', 'w-32', 'w-48', 'w-28'];

/**
 * Each column's width, the process's being what's left: on the headings and
 * on the rows alike, as the headings are a table of their own.
 */
const COLUMN = {
  pid: 'hidden w-20 @2xl:table-cell',
  container: 'w-8 @lg:w-40',
  cpu: 'w-16',
  memory: 'w-18',
};

/**
 * Both tables: a gap after every column but the last, so none run into the
 * next, and room at each row's ends for its rounded highlight.
 */
const TABLE =
  'w-full table-fixed [&_td:first-child]:rounded-l-md [&_td:first-child]:pl-2 [&_td:last-child]:rounded-r-md [&_td:last-child]:pr-2 [&_td:not(:last-child)]:pr-4 [&_th:first-child]:pl-2 [&_th:last-child]:pr-2 [&_th:not(:last-child)]:pr-4';

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
  // Until the first measurement: a process is only listed once it's been
  // measured twice, a few seconds apart
  const measuring = processes.length === 0;
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
    <Card size='sm' className='@container px-3'>
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
          {measuring ? (
            <TextSkeleton className='w-16' />
          ) : query ? (
            `${shown.length} of ${processes.length}`
          ) : (
            `${processes.length} total`
          )}
        </span>
      </div>
      {
        // Seven lines whatever the filter leaves, so the page doesn't shift
        // while typing, or as many as a taller tile has room for: the
        // headings and the processes, the rest a scroll away, faded at the
        // edges while there's more. The headings stand above the scrolling
        // rows rather than stuck over them, where an iPhone showed rows
        // through their top edge. The scrollbar's room is kept beside both,
        // even when it's gone, so the columns line up and stay put
        <div className='flex min-h-[7lh] flex-1 basis-0 flex-col'>
          <div className='[scrollbar-gutter:stable] overflow-hidden'>
            <table className={TABLE}>
              <thead className='text-left text-muted-foreground'>
                <tr>
                  <th className='font-normal'>Process</th>
                  <th className={cn('font-normal', COLUMN.pid)}>PID</th>
                  <th className={cn('font-normal', COLUMN.container)}>
                    <span className='hidden @lg:inline'>Container</span>
                  </th>
                  <SortHeading
                    by='cpu'
                    sort={sort}
                    onSort={setSort}
                    className={COLUMN.cpu}
                  >
                    CPU
                  </SortHeading>
                  <SortHeading
                    by='memory'
                    sort={sort}
                    onSort={setSort}
                    className={COLUMN.memory}
                  >
                    Memory
                  </SortHeading>
                </tr>
              </thead>
            </table>
          </div>
          <div className='min-h-0 flex-1 basis-0'>
            <ScrollFade
              fill
              className='h-full [scrollbar-gutter:stable] overflow-auto'
            >
              <table className={TABLE}>
                <tbody className='tabular-nums'>
                  {/* Rows to come, as the first measurement's under way */}
                  {measuring &&
                    Array.from({ length: SKELETON_ROWS }, (_, i) => (
                      <tr key={i} aria-hidden>
                        <td>
                          <TextSkeleton
                            className={NAME_WIDTHS[i % NAME_WIDTHS.length]}
                          />
                        </td>
                        <td className={COLUMN.pid}>
                          <TextSkeleton className='w-12' />
                        </td>
                        <td className={COLUMN.container} />
                        <td className={COLUMN.cpu}>
                          <span className='flex justify-end'>
                            <TextSkeleton className='w-8' />
                          </span>
                        </td>
                        <td className={COLUMN.memory}>
                          <span className='flex justify-end'>
                            <TextSkeleton className='w-10' />
                          </span>
                        </td>
                      </tr>
                    ))}
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
                        <td
                          className={cn(
                            'font-mono text-muted-foreground',
                            COLUMN.pid
                          )}
                        >
                          {p.pid}
                        </td>
                        <td className={COLUMN.container}>
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
                        <td className={cn('text-right font-mono', COLUMN.cpu)}>
                          {formatCpu(p.cpu)}
                        </td>
                        <td
                          className={cn('text-right font-mono', COLUMN.memory)}
                        >
                          {formatBytes(p.memory)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!measuring && shown.length === 0 && (
                <p className='text-muted-foreground'>No processes match.</p>
              )}
            </ScrollFade>
          </div>
        </div>
      }
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
