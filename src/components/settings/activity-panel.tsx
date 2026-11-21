'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import useSWRInfinite from 'swr/infinite';

import { SearchIcon, XCircleIcon } from 'lucide-react';

import { isActivityAction, type ActivityEntry } from '@/lib/activity/actions';
import { fetcher } from '@/lib/fetcher';

import { Failure } from '@/components/common/failure';
import { TextSkeleton } from '@/components/common/skeletons';
import { useDebounced } from '@/components/common/use-debounced';
import { keepShape, useKeptShape } from '@/components/common/use-kept';
import {
  SettingsFooter,
  SettingsItem,
  SettingsSection,
} from '@/components/settings/section';
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
  const locale = useLocale();
  const t = useTranslations('activity');
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
    <SettingsSection
      title={t('title')}
      description={t('description')}
      action={
        <div className='flex w-full gap-2 sm:w-auto'>
          <InputGroup className='h-8 flex-1 sm:w-56 sm:flex-none'>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={t('filter')}
              aria-label={t('filterLabel')}
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
            {t('failed')}
          </Toggle>
        </div>
      }
    >
      {error && !data ? (
        <SettingsItem>
          <p className='text-destructive'>{error.message}</p>
        </SettingsItem>
      ) : !data ? (
        <div className='contents'>
          {shape.days.map((rows, d) => (
            <Fragment key={d}>
              <DayHeading>
                <TextSkeleton className='w-20' />
              </DayHeading>
              <ul className={DAY}>
                {rows.map((height, i) => (
                  <ActivityRow key={i} index={d + i} height={height} />
                ))}
              </ul>
            </Fragment>
          ))}
          {shape.more && (
            <SettingsFooter>
              <Button variant='outline' size='sm' disabled>
                {t('older')}
              </Button>
            </SettingsFooter>
          )}
        </div>
      ) : entries.length === 0 ? (
        <SettingsItem>
          <p className='text-muted-foreground'>
            {query ? t('noMatch') : failed ? t('noFailures') : t('nothingYet')}
          </p>
        </SettingsItem>
      ) : (
        // One child of the card, as its placeholder is, for measuring: the
        // days draw their own lines
        <div ref={measure} className='contents'>
          {byDay(entries, t, locale).map(([day, list]) => (
            <Fragment key={day}>
              <DayHeading>{day}</DayHeading>
              <ul className={DAY}>
                {list.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </Fragment>
          ))}
          {more && (
            <SettingsFooter>
              <Button
                variant='outline'
                size='sm'
                disabled={loadingMore}
                onClick={() => void setSize(size + 1)}
              >
                {loadingMore ? t('loading') : t('older')}
              </Button>
            </SettingsFooter>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

/**
 * A day's entries, as a list of their own in the card, a line under it
 * unless it's the card's last.
 */
const DAY =
  'flex flex-col divide-y divide-foreground/10 border-b border-foreground/10 px-3 last:border-b-0';

/** The day a list of entries is from, heading them in the card. */
function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className='border-b border-foreground/10 bg-foreground/2 px-3 py-1.5 text-muted-foreground'>
      {children}
    </h4>
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
  const locale = useLocale();
  const t = useTranslations('activity');
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
        {new Date(entry.at).toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
      <div className='flex min-w-0 flex-col'>
        <span className='wrap-break-word'>
          {isActivityAction(entry.action) ? (
            t.rich(`actions.${entry.action}`, {
              user: entry.user,
              target: entry.target ?? '',
              b: (chunks) => <span className='font-medium'>{chunks}</span>,
            })
          ) : (
            // One this copy doesn't know, as it was written
            <>
              <span className='font-medium'>{entry.user}</span> {entry.action}{' '}
              <span className='font-medium'>{entry.target}</span>
            </>
          )}
          {entry.detail && (
            <span className='text-muted-foreground'> · {entry.detail}</span>
          )}
        </span>
        {!entry.ok && (
          <Failure>
            {entry.error
              ? t('didntWorkBecause', { error: entry.error })
              : t('didntWork')}
          </Failure>
        )}
      </div>
    </li>
  );
}

/** Entries under the day they're from: "Today", "Yesterday", "Mon 20 Oct". */
function byDay(
  entries: ActivityEntry[],
  t: ReturnType<typeof useTranslations<'activity'>>,
  locale: string
) {
  const days = new Map<string, ActivityEntry[]>();
  const today = new Date().setHours(0, 0, 0, 0);
  for (const entry of entries) {
    const day = new Date(entry.at).setHours(0, 0, 0, 0);
    const ago = Math.round((today - day) / 86_400_000);
    const name =
      ago === 0
        ? t('today')
        : ago === 1
          ? t('yesterday')
          : new Date(entry.at).toLocaleDateString(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
    days.set(name, [...(days.get(name) ?? []), entry]);
  }
  return [...days];
}
