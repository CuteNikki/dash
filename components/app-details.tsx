'use client';

import useSWR from 'swr';

import { fetcher } from '@/lib/fetcher';
import { formatMoment } from '@/lib/format';
import type { DetailCell, DetailSection } from '@/lib/types';
import { cn } from '@/lib/utils';

import { TextSkeleton } from '@/components/skeletons';

/** How often an app's details are read again while its window is open. */
const REFRESH_MS = 10_000;

/** What an app has to say beyond its tile: who's watching, what's downloading. */
export function AppDetails({ containerId }: { containerId: string }) {
  const { data, error } = useSWR<DetailSection[]>(
    `/api/containers/${containerId}/details`,
    fetcher,
    { refreshInterval: REFRESH_MS }
  );
  if (error && !data) {
    return (
      <span className='text-muted-foreground'>
        Couldn&apos;t read what it has to say: {error.message}
      </span>
    );
  }
  if (!data) {
    // Its sections' shapes aren't known until they're read, so a heading and
    // a few lines stand in for the first
    return (
      <div className='flex flex-col gap-2'>
        <TextSkeleton className='w-24' />
        <TextSkeleton className='w-full' />
        <TextSkeleton className='w-full' />
        <TextSkeleton className='w-2/3' />
      </div>
    );
  }
  return data.map((section) => (
    <div key={section.title} className='flex flex-col gap-2'>
      <span className='text-muted-foreground'>{section.title}</span>
      {section.kind === 'facts' ? (
        <dl className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-2'>
          {section.facts.map(({ label, value }) => (
            <div key={label} className='contents'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='font-mono break-all'>{value}</dd>
            </div>
          ))}
        </dl>
      ) : section.rows.length ? (
        <DetailTable section={section} />
      ) : (
        <span className='text-muted-foreground'>{section.empty}</span>
      )}
    </div>
  ));
}

function DetailTable({
  section,
}: {
  section: Extract<DetailSection, { kind: 'table' }>;
}) {
  // The first column takes what's left and cuts its text short; the rest
  // keep to their content
  const align = (i: number) =>
    section.columns[i].numeric ? 'pl-4 text-right' : i ? 'pl-4' : 'pr-4';
  return (
    <table className='w-full tabular-nums'>
      <thead className='text-muted-foreground'>
        <tr>
          {section.columns.map((column, i) => (
            <th
              key={column.label}
              // Headings sit left, as cells do, but numeric ones' right
              className={cn('pb-1 text-left font-normal', align(i))}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className='font-mono'>
        {section.rows.map((row, r) => (
          <tr key={r} className={cn(row.dim && 'text-muted-foreground')}>
            {row.cells.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  'py-0.5',
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
        className='h-1 w-16 overflow-hidden rounded-full bg-muted'
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
