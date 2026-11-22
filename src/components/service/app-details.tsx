'use client';

import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import useSWR from 'swr';

import { useWords, type Words } from '@/i18n/use-words';

import { fetcher } from '@/lib/fetcher';
import type { DetailCell, DetailKey, DetailSection } from '@/lib/types';
import { cn } from '@/lib/utils';

import { TextSkeleton } from '@/components/common/skeletons';
import { useKeptShape } from '@/components/common/use-kept';

/** How often an app's details are read again while its window is open. */
const REFRESH_MS = 10_000;

/**
 * A cell as last seen, while it's read again: how many characters it had,
 * which in the mono type it's in is how wide it was, and whether it had a
 * progress bar.
 */
type Placeholder = { chars: number; bar?: boolean };
type ShownCell = DetailCell | Placeholder;
/** A section as shown: read, or as it was last time, its cells placeholders. */
type ShownSection =
  | (Omit<Extract<DetailSection, { kind: 'table' }>, 'rows'> & {
      rows: { cells: ShownCell[]; dim?: boolean }[];
    })
  | (Omit<Extract<DetailSection, { kind: 'facts' }>, 'facts'> & {
      facts: { label: DetailKey; value: ShownCell }[];
    });

function placeholderOf(cell: DetailCell, words: Words): Placeholder {
  const text = words.cell(cell);
  if (text !== undefined) return { chars: text.length };
  const { progress } = cell as { progress: number };
  return { chars: `${Math.round(progress * 100)}%`.length, bar: true };
}

/** A section with its cells as placeholders as wide as theirs, to keep. */
function shapeOf(section: DetailSection, words: Words): ShownSection {
  return section.kind === 'facts'
    ? {
        ...section,
        facts: section.facts.map((f) => ({
          ...f,
          value: placeholderOf(f.value, words),
        })),
      }
    : {
        ...section,
        rows: section.rows.map((r) => ({
          ...r,
          cells: r.cells.map((c) => placeholderOf(c, words)),
        })),
      };
}

/**
 * A card in a service's window: its title, how many of something if it
 * counts any, and what it has to show. Each part of the window is one, so
 * where one ends and the next starts is plain. Outlined by a border, inside
 * it, not a ring outside it, which the scrolling around it would cut off.
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
        'flex min-w-0 flex-col gap-3 rounded-lg border border-foreground/10 bg-muted p-3 dark:bg-muted/40',
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
 * there's room for, rather than a column of label and value far apart. Those
 * there are share the width, so one alone has it all; a value wraps between
 * words, splitting one only when it's too long to fit, as a path can be.
 */
/**
 * Text that may wrap after each slash, so a path breaks between its folders
 * rather than in the middle of one's name.
 */
export function Breakable({ text }: { text: string }) {
  const parts = text.split('/');
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ));
}

export function Facts({
  facts,
}: {
  facts: { label: string; value: ShownCell }[];
}) {
  return (
    <dl className='grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-4 gap-y-3'>
      {facts.map(({ label, value }) => (
        <div key={label} className='flex min-w-0 flex-col'>
          <dt className='text-muted-foreground'>{label}</dt>
          <dd className='font-mono wrap-break-word'>
            {typeof value === 'string' ? (
              <Breakable text={value} />
            ) : (
              <Cell cell={value} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What an app has to say beyond its tile, each part a card: who's watching, what's downloading. */
export function AppDetails({ containerId }: { containerId: string }) {
  const t = useTranslations('appDetails');
  const words = useWords();
  const { data, error } = useSWR<DetailSection[]>(
    `/api/containers/${containerId}/details`,
    fetcher,
    { refreshInterval: REFRESH_MS }
  );
  // While they're read, the sections as they were last time
  const kept = useKeptShape<ShownSection[] | undefined>(
    `details:${containerId}`,
    data?.map((section) => shapeOf(section, words)),
    undefined
  );
  if (error && !data) {
    return (
      <Panel title={t('title')}>
        <span className='text-muted-foreground'>
          {t('failed', { error: error.message })}
        </span>
      </Panel>
    );
  }
  if (!data && kept) return <Sections sections={kept} />;
  if (!data) {
    // Its sections' shapes aren't known until they're first read, so a
    // card of a few lines stands in for the first
    return (
      <Panel title={t('title')}>
        <div className='flex flex-col gap-2'>
          <TextSkeleton className='w-full' />
          <TextSkeleton className='w-full' />
          <TextSkeleton className='w-2/3' />
        </div>
      </Panel>
    );
  }
  return <Sections sections={data} />;
}

/** Each section as a card: its facts, or its table and how many rows it has. */
function Sections({ sections }: { sections: ShownSection[] }) {
  const words = useWords();
  return sections.map((section) =>
    section.kind === 'facts' ? (
      <Panel key={section.title} title={words.detail(section.title)}>
        <Facts
          facts={section.facts.map((f) => ({
            label: words.detail(f.label),
            value: f.value,
          }))}
        />
      </Panel>
    ) : (
      <Panel
        key={section.title}
        title={words.detail(section.title)}
        count={section.rows.length || undefined}
      >
        {section.rows.length ? (
          <DetailTable section={section} />
        ) : (
          <span className='text-muted-foreground'>
            {words.detail(section.empty)}
          </span>
        )}
      </Panel>
    )
  );
}

function DetailTable({
  section,
}: {
  section: Extract<ShownSection, { kind: 'table' }>;
}) {
  const words = useWords();
  // With numbers in it, the first column takes what's left and cuts its text
  // short; the rest keep to their content, together at the right, so a row's
  // numbers are read beside each other rather than across the window.
  // Without, as Caddy's sites, every column is whole, and it scrolls sideways
  const cuts = section.columns.some((c) => c.numeric);
  const align = (i: number) =>
    // Closer together on a phone, so its columns fit without scrolling
    section.columns[i].numeric
      ? 'pl-6 text-right max-sm:pl-3'
      : i
        ? 'pl-6 max-sm:pl-3'
        : '';
  return (
    // Wider than its card, as on a phone, it scrolls sideways within it
    <div className='overflow-x-auto'>
      <table className='w-full tabular-nums'>
        <thead className='text-muted-foreground'>
          <tr className='border-b border-foreground/10'>
            {section.columns.map((column, i) => (
              <th
                key={column.label}
                className={cn(
                  'pb-1.5 text-left font-normal whitespace-nowrap',
                  align(i),
                  // Taking what's left, though never so little its names vanish
                  i === 0 && 'w-full',
                  i === 0 && cuts && 'min-w-28 max-sm:min-w-20'
                )}
              >
                {words.detail(column.label)}
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
                    i === 0 && cuts ? 'max-w-0 truncate' : 'whitespace-nowrap'
                  )}
                  title={
                    i === 0 && cuts && !('chars' in Object(cell))
                      ? words.cell(cell as DetailCell)
                      : undefined
                  }
                >
                  <Cell cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell }: { cell: ShownCell }) {
  const words = useWords();
  if (typeof cell === 'string') return cell;
  if ('chars' in cell) {
    const placeholder = (
      <span
        className='inline-block align-top'
        style={{ width: `${cell.chars}ch` }}
      >
        <TextSkeleton className='w-full' />
      </span>
    );
    return cell.bar ? (
      <span className='flex items-center justify-end gap-2'>
        <span aria-hidden className='h-1 w-16 rounded-full bg-foreground/10' />
        {placeholder}
      </span>
    ) : (
      placeholder
    );
  }
  const text = words.cell(cell);
  if (text !== undefined) return text;
  const percent = Math.round((cell as { progress: number }).progress * 100);
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
