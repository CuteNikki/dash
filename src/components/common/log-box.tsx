'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ListEndIcon, SearchIcon, WrapTextIcon } from 'lucide-react';

import type { Tone } from '@/lib/ansi';
import type { LogLine } from '@/lib/log-lines';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/common/scroll-fade';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/** How close to the end counts as the end, as zoom and rounding can leave a pixel or two. */
const BOTTOM_SLACK_PX = 4;

const TONE_CLASS: Record<Tone, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  muted: 'text-muted-foreground',
};

/**
 * Lines as a log shows them, a container's or a job's: a filter, wrapping
 * long lines or not, and following the newest line, until scrolled up to
 * read back, and again once back at the end. Until there are lines, what
 * it's waiting on, or why there are none.
 */
export function LogBox({
  lines,
  empty,
  label,
  follow: followProp,
  onFollowChangeAction,
  className,
  boxClassName,
}: {
  lines: LogLine[];
  /** What shows before there are lines: a placeholder, a skeleton, an error */
  empty: React.ReactNode;
  /** What the lines are, for the filter's label: "logs", "output" */
  label: string;
  /** Following the newest line, for a parent that also sets it */
  follow?: boolean;
  onFollowChangeAction?: (follow: boolean) => void;
  /** The whole, filter and box: as in a panel, flex-1 to fill it */
  className?: string;
  /** The box's own, such as its height in a window */
  boxClassName?: string;
}) {
  const [filter, setFilter] = useState('');
  const [ownFollow, setOwnFollow] = useState(true);
  const follow = followProp ?? ownFollow;
  const setFollow = (next: boolean) => {
    setOwnFollow(next);
    onFollowChangeAction?.(next);
  };
  const [wrap, setWrap] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines;
  }, [lines, filter]);

  // Before the browser paints, so new lines show up already scrolled to
  useLayoutEffect(() => {
    const el = scroller.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [shown, follow]);

  // While following, stays at the end when the log changes size without new
  // lines: wrapping turned on or off, the window resized, the font loading
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(follow);
  useEffect(() => {
    following.current = follow;
  }, [follow]);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  // Shift and the wheel scroll long lines sideways, which some browsers report
  // as scrolling down. The panel (a dialog, keeping the page behind it still)
  // cancels that on the document at the end of the log, so those wheel turns
  // stop here and the browser scrolls them as it does everywhere else.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (e.shiftKey) e.stopPropagation();
    }
    el.addEventListener('wheel', onWheel);
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Where the last scroll left off, to tell the reader scrolling up from the
  // log itself changing under it (new lines, old ones dropping off, a filter)
  const lastScroll = useRef({ top: 0, height: 0 });

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const last = lastScroll.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX) {
      if (!follow) setFollow(true);
    } else if (el.scrollTop < last.top && el.scrollHeight === last.height) {
      if (follow) setFollow(false);
    }
    lastScroll.current = { top: el.scrollTop, height: el.scrollHeight };
  }

  return (
    // Never wider than where it's put, as a window's grid would let its
    // longest unwrapped line make it: long lines scroll sideways inside it
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-3', className)}>
      <div className='flex items-center gap-2'>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder='Filter'
            aria-label={`Filter ${label}`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </InputGroup>
        <Button
          type='button'
          variant={wrap ? 'default' : 'outline'}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          <WrapTextIcon />
          Wrap
        </Button>
        <Button
          type='button'
          variant={follow ? 'default' : 'outline'}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
        >
          <ListEndIcon />
          Follow
        </Button>
      </div>
      {/* The box clips the fades to its rounded corners */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-hidden rounded-lg bg-muted font-mono text-xs/relaxed',
          boxClassName
        )}
      >
        <ScrollFade
          ref={scroller}
          // Scrolling up stops following; scrolling back to the end resumes it
          onScrollAction={onScroll}
          className='h-full overflow-auto p-3'
          fadeFrom='from-muted'
          fill
        >
          <div ref={content} aria-live='polite'>
            {!lines.length ? (
              empty
            ) : !shown.length ? (
              <p className='text-muted-foreground'>No lines match.</p>
            ) : (
              shown.map((line, i) => (
                <Fragment key={line.id}>
                  {line.time &&
                    dayOf(line.time) !== dayOf(shown[i - 1]?.time) && (
                      <div className='flex items-center gap-3 py-2 text-muted-foreground'>
                        {dayLabel(line.time)}
                        <span className='h-px flex-1 bg-border' />
                      </div>
                    )}
                  <Line line={line} wrap={wrap} />
                </Fragment>
              ))
            )}
          </div>
        </ScrollFade>
      </div>
    </div>
  );
}

/** The calendar day of a time, to tell when the log moves on to another. */
function dayOf(time?: Date) {
  return time?.toDateString();
}

/** "Today", "Yesterday", or the date, with the year once it's not this one. */
function dayLabel(time: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayOf(time) === dayOf(now)) return 'Today';
  if (dayOf(time) === dayOf(yesterday)) return 'Yesterday';
  return time.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: time.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Hours with two digits, so every time is as wide as the next and the text
 * after them lines up, before 10 o'clock as after.
 */
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** One line: its time, if it has one, then its text, wrapping at the log's edge under the text, not the time. */
function Line({ line, wrap }: { line: LogLine; wrap: boolean }) {
  return (
    <div className={cn('flex', line.time && 'gap-3')}>
      {line.time && (
        <span className='shrink-0 whitespace-pre text-muted-foreground tabular-nums'>
          {line.time.toLocaleTimeString(undefined, TIME_FORMAT)}
        </span>
      )}
      <span
        className={cn(
          wrap
            ? 'min-w-0 flex-1 wrap-anywhere whitespace-pre-wrap'
            : 'whitespace-pre'
        )}
      >
        {line.segments.map((segment, i) => (
          <span
            key={i}
            className={cn(
              segment.tone && TONE_CLASS[segment.tone],
              segment.bold && 'font-semibold'
            )}
          >
            {/* An empty line keeps its height */}
            {segment.text || ' '}
          </span>
        ))}
      </span>
    </div>
  );
}
