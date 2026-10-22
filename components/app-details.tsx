'use client';

import useSWR from 'swr';

import { fetcher } from '@/lib/fetcher';
import { formatMoment } from '@/lib/format';
import type { DetailCell, DetailSection } from '@/lib/types';
import { cn } from '@/lib/utils';

import { TextSkeleton } from '@/components/skeletons';

/** How often an app's details are read again while its window is open. */
const REFRESH_MS = 10_000;

/**
 * A card in a service's window: its title, how many of something if it
 * counts any, and what it has to show. Each part of the window is one, so
 * where one ends and the next starts is plain.
 */
export function Panel({
  title,
  count,
  className,
  children,
}: {
  title: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/10',
        className
      )}
    >
      <h3 className='flex items-center gap-2 text-muted-foreground'>
        {title}
        {count !== undefined && (
          <span className='font-mono tabular-nums'>{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

/**
 * Labelled values as a grid, each its label above it, as many across as
 * there's room for, rather than a column of label and value far apart.
 */
export function Facts({
  facts,
}: {
  facts: { label: string; value: DetailCell }[];
}) {
  return (
    <dl className='grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-3'>
      {facts.map(({ label, value }) => (
        <div key={label} className='flex min-w-0 flex-col'>
          <dt className='text-muted-foreground'>{label}</dt>
          <dd className='font-mono break-all'>
            <Cell cell={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What an app has to say beyond its tile, each part a card: who's watching, what's downloading. */
export function AppDetails({ containerId }: { containerId: string }) {
  const { data, error } = useSWR<DetailSection[]>(
    `/api/containers/${containerId}/details`,
    fetcher,
    { refreshInterval: REFRESH_MS }
  );
  if (error && !data) {
    return (
      <Panel title='Details'>
        <span className='text-muted-foreground'>
          Couldn&apos;t read what it has to say: {error.message}
        </span>
      </Panel>
    );
  }
  if (!data) {
    // Its sections' shapes aren't known until they're read, so a card of a
    // few lines stands in for the first
    return (
      <Panel title='Details'>
        <div className='flex flex-col gap-2'>
          <TextSkeleton className='w-full' />
          <TextSkeleton className='w-full' />
          <TextSkeleton className='w-2/3' />
        </div>
      </Panel>
    );
  }
  return data.map((section) =>
    section.kind === 'facts' ? (
      <Panel key={section.title} title={section.title}>
        <Facts facts={section.facts} />
      </Panel>
    ) : (
      <Panel
        key={section.title}
        title={section.title}
        count={section.rows.length || undefined}
      >
        {section.rows.length ? (
          <DetailTable section={section} />
        ) : (
          <span className='text-muted-foreground'>{section.empty}</span>
        )}
      </Panel>
    )
  );
}

function DetailTable({
  section,
}: {
  section: Extract<DetailSection, { kind: 'table' }>;
}) {
  // The first column takes what's left and cuts its text short; the rest
  // keep to their content, together at the right, so a row's numbers are
  // read beside each other rather than across the window
  const align = (i: number) =>
    section.columns[i].numeric ? 'pl-6 text-right' : i ? 'pl-6' : '';
  return (
    <table className='w-full tabular-nums'>
      <thead className='text-muted-foreground'>
        <tr className='border-b border-foreground/10'>
          {section.columns.map((column, i) => (
            <th
              key={column.label}
              className={cn(
                'pb-1.5 text-left font-normal whitespace-nowrap',
                align(i),
                i === 0 && 'w-full'
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className='font-mono'>
        {section.rows.map((row, r) => (
          <tr
            key={r}
            className={cn(
              'border-b border-foreground/5 last:border-0',
              row.dim && 'text-muted-foreground'
            )}
          >
            {row.cells.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  'py-1.5',
                  align(i),
                  i === 0 ? 'max-w-0 truncate' : 'whitespace-nowrap'
                )}
                title={i === 0 && typeof cell === 'string' ? cell : undefined}
              >
                <Cell cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ cell }: { cell: DetailCell }) {
  if (typeof cell === 'string') return cell;
  if ('at' in cell) return formatMoment(cell.at);
  const percent = Math.round(cell.progress * 100);
  return (
    <span className='flex items-center justify-end gap-2'>
      <span
        aria-hidden
        className='h-1 w-16 overflow-hidden rounded-full bg-foreground/10'
      >
        <span
          className='block h-full rounded-full bg-foreground/60'
          style={{ width: `${percent}%` }}
        />
      </span>
      {percent}%
    </span>
  );
}
