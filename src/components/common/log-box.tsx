'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ChevronRightIcon,
  CopyIcon,
  ListEndIcon,
  SearchIcon,
  WrapTextIcon,
} from 'lucide-react';

import type { Tone } from '@/lib/ansi';
import {
  inlineJson,
  summaryFields,
  type JsonLog,
  type LogLine,
} from '@/lib/log-lines';
import { cn } from '@/lib/utils';
import { splitWide } from '@/lib/wide-text';

import { ScrollFade } from '@/components/common/scroll-fade';
import { copyText } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/** How close to the end counts as the end, as zoom and rounding can leave a pixel or two. */
const BOTTOM_SLACK_PX = 4;

/** Room kept for a scrollbar drawn over the lines, as ScrollFade keeps it. */
const OVERLAY_BAR_PX = 6;

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

  // The day of the lines at the top, once its divider's scrolled up from
  // where it rests at the top of the scroll, shown there over the lines so
  // which day they're from still shows, and so neither moves as one hands
  // over to the other
  const [pinnedDay, setPinnedDay] = useState<string>();
  // Where the pinned day reaches at the box's right: to the scrollbar, as
  // the top's fade does, so lines running long, unwrapped, under the scroll's
  // padding go under it too; and how far short of that its rule stops, to
  // end where the divider's does
  const [pinnedEdge, setPinnedEdge] = useState({ right: 0, ruleEnd: 0 });

  function pinDay() {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    // Past the scroll's padding, where the first divider rests; less half a
    // pixel, as zoom can leave it a fraction off
    const style = getComputedStyle(el);
    const rest =
      el.getBoundingClientRect().top + parseFloat(style.paddingTop) - 0.5;
    // The scrollbar's room, as ScrollFade keeps it: some for one drawn over
    // the lines, unless they scroll sideways, as their text then runs there
    const bar = el.offsetWidth - el.clientWidth;
    const right =
      el.scrollWidth - el.clientWidth > 1 ? bar : Math.max(bar, OVERLAY_BAR_PX);
    const ruleEnd = bar + parseFloat(style.paddingRight) - right;
    setPinnedEdge((edge) =>
      edge.right === right && edge.ruleEnd === ruleEnd
        ? edge
        : { right, ruleEnd }
    );
    let day: string | undefined;
    for (const divider of inner.querySelectorAll<HTMLElement>('[data-day]')) {
      if (divider.getBoundingClientRect().top > rest) break;
      day = divider.dataset.day;
    }
    setPinnedDay(day);
  }

  // Again when the lines change under it: new ones, a filter, wrapping
  useLayoutEffect(pinDay, [shown, wrap]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    pinDay();
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
          'group/log relative min-h-0 flex-1 overflow-hidden rounded-lg bg-muted font-mono text-xs/relaxed',
          boxClassName
        )}
      >
        {shown.length > 0 && (
          // Over the box rather than in its scroll, so it stays in the
          // corner, over the day pinned at the top; the lines the filter
          // leaves, as they're shown. Filled in the dark, where an outline
          // button's fill is faint, so the day's rule doesn't show through
          // Half a line down, so it's centred on the day's line, which starts
          // a button's half-height, the scroll's padding, further down
          <Button
            type='button'
            variant='outline'
            size='icon-sm'
            aria-label={`Copy the ${label}`}
            title='Copy'
            className='absolute top-[0.5lh] right-4 z-20 opacity-0 transition-opacity group-hover/log:opacity-100 focus-visible:opacity-100 dark:bg-muted'
            onClick={() =>
              void copyText(
                shown.map((l) => l.text).join('\n'),
                shown.length === 1
                  ? 'Copied the line'
                  : `Copied ${shown.length} lines`
              )
            }
          >
            <CopyIcon />
          </Button>
        )}
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
                      // Apart from the line before it by a margin, so it rests
                      // at the top of the scroll as the first one does, and
                      // the day pinned there stands where both are
                      <div
                        data-day={dayLabel(line.time)}
                        className='mt-2 flex items-center gap-3 pb-2 text-muted-foreground first:mt-0'
                      >
                        {dayLabel(line.time)}
                        <span className='mr-9 h-px flex-1 bg-border' />
                      </div>
                    )}
                  <Line line={line} wrap={wrap} />
                </Fragment>
              ))
            )}
          </div>
        </ScrollFade>
        {/* Over the scroll and its fade, with a fade of its own under it,
            so lines fade out under the day as they do at the top; to the
            scrollbar, as that fade is. Where the divider is at the top of the scroll,
            past its padding, so handing over from one to the other moves
            nothing; each one's rule stops short of the copy button. A
            little past the box's top, as its fade is, as a screen can round
            the two to different pixels and leave a line of text showing
            above it. The divider in the lines says it already */}
        {pinnedDay && (
          <div
            aria-hidden
            style={{ right: pinnedEdge.right }}
            className='pointer-events-none absolute -top-0.5 left-0 z-10'
          >
            <div
              style={{ paddingRight: pinnedEdge.ruleEnd }}
              className='flex items-center gap-3 bg-muted pt-3.5 pb-2 pl-3 text-muted-foreground'
            >
              {pinnedDay}
              <span className='mr-9 h-px flex-1 bg-border' />
            </div>
            <div className='h-[2lh] bg-linear-to-b from-muted to-transparent' />
          </div>
        )}
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
        {line.json ? (
          <JsonText json={line.json} />
        ) : (
          line.segments.map((segment, i) => (
            <span
              key={i}
              className={cn(
                segment.tone && TONE_CLASS[segment.tone],
                segment.bold && 'font-semibold'
              )}
            >
              {/* An empty line keeps its height */}
              <Cells text={segment.text || ' '} />
            </span>
          ))
        )}
      </span>
    </div>
  );
}

/**
 * A JSON line, as a structured logger writes them: its logger, its message
 * in its level's color, and its other fields as key=value, as many as say
 * something at a glance (see summaryFields). Opened, the whole object,
 * indented.
 */
function JsonText({ json }: { json: JsonLog }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type='button'
        aria-expanded={open}
        aria-label={open ? 'Fold the line' : 'Show the whole line'}
        onClick={() => setOpen(!open)}
        className='mr-1 inline-flex h-lh items-center align-top text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground'
      >
        <ChevronRightIcon
          className={cn('size-3 transition-transform', open && 'rotate-90')}
        />
      </button>
      {json.logger && (
        <span className='text-muted-foreground'>{json.logger} </span>
      )}
      {json.message !== undefined && (
        <span className={cn(json.tone && TONE_CLASS[json.tone])}>
          <Cells text={json.message || ' '} />
        </span>
      )}
      {summaryFields(json).map(([key, value]) => (
        <Fragment key={key}>
          {' '}
          <span className='text-muted-foreground'>{key}=</span>
          <Cells text={value} />
        </Fragment>
      ))}
      {open && <JsonBlock value={json.value} />}
    </>
  );
}

/** An object as indented JSON, the whole of a line, under its summary. */
function JsonBlock({ value }: { value: Record<string, unknown> }) {
  return (
    // Room at its left for the arrows, which hang before their keys
    <span className='mt-1 mb-2 block border-l-2 border-border pl-6'>
      <JsonNode value={value} open />
    </span>
  );
}

/**
 * One value of an object, under its key, as JSON: on one line if it fits
 * (see inlineJson), else folded away to open, as a request's headers are,
 * with how much is in it. Its keys muted, so the values stand out.
 */
function JsonNode({
  name,
  value,
  last = true,
  open: openAtFirst = false,
}: {
  /** Its key, in an object; none in a list, or for the whole */
  name?: string;
  value: unknown;
  /** The last in what it's in, without a comma after it */
  last?: boolean;
  /** Open at first, as the whole object is */
  open?: boolean;
}) {
  const [open, setOpen] = useState(openAtFirst);
  const key = name !== undefined && (
    <span className='text-muted-foreground'>{JSON.stringify(name)}: </span>
  );
  const comma = last ? '' : ',';
  const inline = inlineJson(value);
  if (inline !== undefined) {
    return (
      <span className='block'>
        {key}
        <Cells text={inline} />
        {comma}
      </span>
    );
  }
  const list = Array.isArray(value);
  const entries: [string | undefined, unknown][] = list
    ? value.map((v) => [undefined, v])
    : Object.entries(value as Record<string, unknown>);
  const [start, end] = list ? ['[', ']'] : ['{', '}'];
  const toggle = (
    <button
      type='button'
      aria-expanded={open}
      aria-label={open ? `Fold ${name ?? 'it'}` : `Open ${name ?? 'it'}`}
      onClick={() => setOpen(!open)}
      className='-ml-4 inline-flex h-lh w-4 items-center align-top text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground'
    >
      <ChevronRightIcon
        className={cn('size-3 transition-transform', open && 'rotate-90')}
      />
    </button>
  );
  if (!open) {
    const count = entries.length;
    return (
      <span className='block'>
        {toggle}
        {key}
        {start}…{end}
        {comma}{' '}
        <span className='text-muted-foreground'>
          {count}{' '}
          {list
            ? count === 1
              ? 'item'
              : 'items'
            : count === 1
              ? 'key'
              : 'keys'}
        </span>
      </span>
    );
  }
  return (
    <>
      <span className='block'>
        {/* The whole object, open for good, needs no arrow */}
        {name !== undefined && toggle}
        {key}
        {start}
      </span>
      {/* Indented as JSON is, two characters */}
      <span className='block pl-[2ch]'>
        {entries.map(([k, v], i) => (
          <JsonNode
            key={k ?? i}
            name={k}
            value={v}
            last={i === entries.length - 1}
          />
        ))}
      </span>
      <span className='block'>
        {end}
        {comma}
      </span>
    </>
  );
}

/**
 * Text as a terminal lays it out: each wide character, an emoji shown as a
 * picture, exactly two cells, however wide its font draws it, so a table
 * printed around one lines up as it did there.
 */
function Cells({ text }: { text: string }) {
  return splitWide(text).map((run, i) =>
    run.wide ? (
      <span
        key={i}
        className='inline-block h-lh w-[2ch] overflow-hidden text-center align-top'
      >
        {run.text}
      </span>
    ) : (
      <Fragment key={i}>{run.text}</Fragment>
    )
  );
}
