'use client';

import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import { SearchIcon, XCircleIcon } from 'lucide-react';

import { actionWords, type ActivityEntry } from '@/lib/activity/actions';
import { fetcher } from '@/lib/fetcher';

import { Failure } from '@/components/common/failure';
import { TextSkeleton } from '@/components/common/skeletons';
import { useDebounced } from '@/components/common/use-debounced';
import { keepShape, useKeptShape } from '@/components/common/use-kept';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';

type Page = { entries: ActivityEntry[]; more: boolean };

/** Placeholder lines' lengths, as entries' vary. */
const WIDTHS = ['w-72', 'w-96', 'w-56', 'w-80', 'w-64'];

/** The list as last drawn: each day's rows' heights, and whether there was more. */
type Shape = { days: number[][]; more: boolean };
const SHAPE = 'activity';
/** A row of one line, before any's been measured */
const ROW_PX = 33;

/** The newest page refreshes, for what's done while it's open. */
const REFRESH_MS = 30_000;

/**
 * Who did what from the dashboard, and when, newest first, a day at a time:
 * starting and stopping, updates, files, people's accounts. Kept 90 days.
 */
export function ActivityPanel() {
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim());
  const [failed, setFailed] = useState(false);
  const { data, error, size, setSize, isValidating } = useSWRInfinite<Page>(
    (index, previous: Page | null) => {
      if (previous && !previous.more) return null;
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (failed) params.set('failed', '1');
      const last = previous?.entries.at(-1);
      if (last) params.set('before', String(last.at));
      return `/api/activity?${params}`;
    },
    fetcher,
    { refreshInterval: REFRESH_MS }
  );
  const entries = data?.flatMap((p) => p.entries) ?? [];
  const more = data?.at(-1)?.more ?? false;
  const loadingMore = isValidating && data !== undefined && size > data.length;
  // While it's read, as many days of rows as tall as last time, as a row
  // that wraps is taller, and Older if there was more
  const shape = useKeptShape<Shape>(SHAPE, undefined, {
    days: [Array<number>(8).fill(ROW_PX)],
    more: true,
  });
  /** What the list looks like as drawn, kept for its placeholder. */
  const measure = (el: HTMLDivElement | null) => {
    if (!el) return;
    keepShape(SHAPE, {
      days: [...el.querySelectorAll('ul')].map((ul) =>
        [...ul.children].map((li) => li.getBoundingClientRect().height)
      ),
      more,
    } satisfies Shape);
  };

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='mr-auto flex flex-col'>
          <h3 className='font-medium'>Activity</h3>
          <p className='text-muted-foreground'>
            What's been done from the dashboard, and by whom, over the last 90
            days
          </p>
        </div>
        <div className='flex w-full gap-2 sm:w-auto'>
          <InputGroup className='h-8 flex-1 sm:w-56 sm:flex-none'>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder='Filter by person, service…'
              aria-label='Filter the activity'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Toggle
            variant='outline'
            size='lg'
            pressed={failed}
            onPressedChange={setFailed}
            className='data-[state=on]:text-destructive'
          >
            <XCircleIcon />
            Failed
          </Toggle>
        </div>
      </div>
      {error && !data ? (
        <p className='text-destructive'>{error.message}</p>
      ) : !data ? (
        <div className='flex flex-col gap-4'>
          {shape.days.map((rows, d) => (
            <div key={d} className='flex flex-col gap-1'>
              <h4>
                <TextSkeleton className='w-20' />
              </h4>
              <ul className='flex flex-col divide-y divide-border'>
                {rows.map((height, i) => (
                  <ActivityRow key={i} index={d + i} height={height} />
                ))}
              </ul>
            </div>
          ))}
          {shape.more && (
            <Button variant='outline' size='sm' disabled className='self-start'>
              Older
            </Button>
          )}
        </div>
      ) : entries.length === 0 ? (
        <p className='text-muted-foreground'>
          {query
            ? 'Nothing matches that.'
            : failed
              ? 'Nothing has failed.'
              : 'Nothing done yet.'}
        </p>
      ) : (
        <div ref={measure} className='flex flex-col gap-4'>
          {byDay(entries).map(([day, list]) => (
            <div key={day} className='flex flex-col gap-1'>
              <h4 className='text-muted-foreground'>{day}</h4>
              <ul className='flex flex-col divide-y divide-border'>
                {list.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
          {more && (
            <Button
              variant='outline'
              size='sm'
              disabled={loadingMore}
              onClick={() => void setSize(size + 1)}
              className='self-start'
            >
              {loadingMore ? 'Loading…' : 'Older'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Nikki stopped minecraft", when, and what more there is to say. Without
 * an entry, the same row with placeholders, while they're read.
 */
function ActivityRow({
  entry,
  index = 0,
  height,
}: {
  entry?: ActivityEntry;
  /** A placeholder's place, for its line's length */
  index?: number;
  /** A placeholder's height, as its entry's was */
  height?: number;
}) {
  if (!entry) {
    return (
      <li className='flex items-baseline gap-3 py-1.5' style={{ height }}>
        {/* As wide as a time, "12:35 AM" */}
        <span className='w-[8ch] shrink-0 font-mono'>
          <TextSkeleton className='w-full' />
        </span>
        <span className='min-w-0 flex-1'>
          <TextSkeleton className={WIDTHS[index % WIDTHS.length]} />
        </span>
      </li>
    );
  }
  return (
    <li className='flex items-baseline gap-3 py-1.5'>
      <time
        dateTime={new Date(entry.at).toISOString()}
        className='shrink-0 font-mono whitespace-nowrap text-muted-foreground tabular-nums'
      >
        {new Date(entry.at).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
      <div className='flex min-w-0 flex-col'>
        <span className='wrap-break-word'>
          <span className='font-medium'>{entry.user}</span>{' '}
          {actionWords(entry.action)}
          {entry.target && (
            <>
              {' '}
              <span className='font-medium'>{entry.target}</span>
            </>
          )}
          {entry.detail && (
            <span className='text-muted-foreground'> · {entry.detail}</span>
          )}
        </span>
        {!entry.ok && (
          <Failure>{`Didn't work${entry.error ? `: ${entry.error}` : ''}`}</Failure>
        )}
      </div>
    </li>
  );
}

/** Entries under the day they're from: "Today", "Yesterday", "Mon 20 Oct". */
function byDay(entries: ActivityEntry[]) {
  const days = new Map<string, ActivityEntry[]>();
  const today = new Date().setHours(0, 0, 0, 0);
  for (const entry of entries) {
    const day = new Date(entry.at).setHours(0, 0, 0, 0);
    const ago = Math.round((today - day) / 86_400_000);
    const name =
      ago === 0
        ? 'Today'
        : ago === 1
          ? 'Yesterday'
          : new Date(entry.at).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
    days.set(name, [...(days.get(name) ?? []), entry]);
  }
  return [...days];
}
