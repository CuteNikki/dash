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

import {
  afterCarriageReturn,
  hasAnsi,
  parseAnsi,
  withoutLeadingTime,
  type Segment,
  type Tone,
} from '@/lib/ansi';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/** Lines kept in the viewer; older ones drop off the top. */
const MAX_LINES = 2_000;
/** How close to the end counts as the end, as zoom and rounding can leave a pixel or two. */
const BOTTOM_SLACK_PX = 4;

type Line = {
  id: number;
  time?: Date;
  /** Without color codes, for filtering */
  text: string;
  segments: Segment[];
};

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s?/;
/**
 * The level a line states, for lines without colors of their own: a level
 * word in capitals (ERROR, WARN), a structured one ("level":"error",
 * level=warn), or the line starting with it ("error: …", "[warn]"). The words
 * inside a file name or a message, like commands/warn.ts, don't count.
 */
function levelPattern(capitals: string, words: string) {
  return new RegExp(
    [
      `\\b(${capitals})\\b`,
      `\\blevel["']?\\s*[:=]\\s*["']?(${words})\\b`,
      `^\\s*\\[?(${words})\\]?:?\\s`,
    ].join('|')
  );
}
const ERROR_LEVEL = levelPattern(
  'ERROR|ERR|FATAL|PANIC|CRITICAL',
  'error|err|fatal|panic|critical'
);
const WARNING_LEVEL = levelPattern('WARN|WARNING|WRN', 'warn|warning|wrn');

const TONE_CLASS: Record<Tone, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  muted: 'text-muted-foreground',
};

/** A line's own colors, or for one without, the level it states. */
function segmentsOf(text: string): Segment[] {
  if (hasAnsi(text)) return parseAnsi(text);
  const tone: Tone | undefined = ERROR_LEVEL.test(text)
    ? 'error'
    : WARNING_LEVEL.test(text)
      ? 'warning'
      : undefined;
  return [{ text, tone }];
}

function parse(id: number, entry: { stream: string; line: string }): Line {
  const match = entry.line.match(TIMESTAMP);
  const segments = segmentsOf(
    withoutLeadingTime(
      afterCarriageReturn(
        match ? entry.line.slice(match[0].length) : entry.line
      )
    )
  );
  return {
    id,
    time: match ? new Date(match[1]) : undefined,
    text: segments.map((s) => s.text).join(''),
    segments,
  };
}

/** A container's log, following new lines as they're written. Keyed by container, so a new one starts empty. */
export function LogViewer({ containerId }: { containerId: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState('');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    let next = 0;
    (async () => {
      const res = await fetch(`/api/containers/${containerId}/logs`, {
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        setError((await res.json().catch(() => null))?.error ?? res.statusText);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let rest = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parts = (rest + value).split('\n');
        rest = parts.pop() ?? '';
        const parsed = parts
          .filter(Boolean)
          .map((p) => parse(next++, JSON.parse(p)));
        setLines((old) => [...old, ...parsed].slice(-MAX_LINES));
      }
    })().catch((e: Error) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => abort.abort();
  }, [containerId]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines;
  }, [lines, filter]);

  // Before the browser paints, so new lines show up already scrolled to
  useLayoutEffect(() => {
    const el = scroller.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [shown, follow]);

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
      setFollow(true);
    } else if (el.scrollTop < last.top && el.scrollHeight === last.height) {
      setFollow(false);
    }
    lastScroll.current = { top: el.scrollTop, height: el.scrollHeight };
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex items-center gap-2'>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder='Filter'
            aria-label='Filter logs'
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </InputGroup>
        <Button
          variant={wrap ? 'default' : 'outline'}
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
        >
          <WrapTextIcon />
          Wrap
        </Button>
        <Button
          variant={follow ? 'default' : 'outline'}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
        >
          <ListEndIcon />
          Follow
        </Button>
      </div>
      <div
        ref={scroller}
        // Scrolling up stops following; scrolling back to the end resumes it
        onScroll={onScroll}
        className='min-h-0 flex-1 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed'
      >
        {error ? (
          <p className='text-destructive'>{error}</p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground'>
            {filter ? 'No lines match.' : 'No log lines yet.'}
          </p>
        ) : (
          shown.map((line, i) => (
            <Fragment key={line.id}>
              {line.time && dayOf(line.time) !== dayOf(shown[i - 1]?.time) && (
                <div className='flex items-center gap-3 py-2 text-muted-foreground'>
                  {dayLabel(line.time)}
                  <span className='h-px flex-1 bg-border' />
                </div>
              )}
              <LogLine line={line} wrap={wrap} />
            </Fragment>
          ))
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

/** One line: its time, then its text, wrapping (past 160 characters) under the text, not the time. */
function LogLine({ line, wrap }: { line: Line; wrap: boolean }) {
  return (
    <div className='flex gap-3'>
      <span className='shrink-0 whitespace-pre text-muted-foreground tabular-nums'>
        {line.time?.toLocaleTimeString()}
      </span>
      <span
        className={cn(
          wrap
            ? 'w-max max-w-log-line shrink-0 wrap-anywhere whitespace-pre-wrap'
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
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  );
}
