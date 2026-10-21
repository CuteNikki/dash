'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ListEndIcon, SearchIcon } from 'lucide-react';

import { hasAnsi, parseAnsi, type Segment, type Tone } from '@/lib/ansi';
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
const ERROR_WORDS = /\b(error|err|fatal|panic|exception)\b/i;
const WARNING_WORDS = /\b(warn|warning|wrn)\b/i;

const TONE_CLASS: Record<Tone, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
  muted: 'text-muted-foreground',
};

/** A line's own colors, or for one without, a guess from words like "error". */
function segmentsOf(text: string): Segment[] {
  if (hasAnsi(text)) return parseAnsi(text);
  const tone: Tone | undefined = ERROR_WORDS.test(text)
    ? 'error'
    : WARNING_WORDS.test(text)
      ? 'warning'
      : undefined;
  return [{ text, tone }];
}

function parse(id: number, entry: { stream: string; line: string }): Line {
  const match = entry.line.match(TIMESTAMP);
  const segments = segmentsOf(
    match ? entry.line.slice(match[0].length) : entry.line
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

  useEffect(() => {
    const el = scroller.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [shown, follow]);

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
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(
            el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX
          );
        }}
        className='min-h-0 flex-1 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed'
      >
        {error ? (
          <p className='text-destructive'>{error}</p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground'>
            {filter ? 'No lines match.' : 'No log lines yet.'}
          </p>
        ) : (
          shown.map((line) => (
            <div key={line.id} className='flex gap-3 whitespace-pre'>
              <span className='shrink-0 text-muted-foreground tabular-nums'>
                {line.time?.toLocaleTimeString()}
              </span>
              <span>
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
          ))
        )}
      </div>
    </div>
  );
}
