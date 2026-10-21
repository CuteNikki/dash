'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ArrowDownToLineIcon, SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';

/** Lines kept in the viewer; older ones drop off the top. */
const MAX_LINES = 2_000;

type Line = { id: number; time?: Date; text: string; stderr: boolean };

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s?/;
const ERROR_WORDS = /\b(error|err|fatal|panic|exception)\b/i;
const WARNING_WORDS = /\b(warn|warning|wrn)\b/i;

function parse(id: number, entry: { stream: string; line: string }): Line {
  const match = entry.line.match(TIMESTAMP);
  return {
    id,
    time: match ? new Date(match[1]) : undefined,
    text: match ? entry.line.slice(match[0].length) : entry.line,
    stderr: entry.stream === 'stderr',
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
        <Toggle
          variant='outline'
          pressed={follow}
          onPressedChange={setFollow}
          aria-label='Follow new lines'
        >
          <ArrowDownToLineIcon />
          Follow
        </Toggle>
      </div>
      <div
        ref={scroller}
        onWheel={(e) => e.deltaY < 0 && setFollow(false)}
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
              <span
                className={cn(
                  ERROR_WORDS.test(line.text)
                    ? 'text-destructive'
                    : WARNING_WORDS.test(line.text) && 'text-warning'
                )}
              >
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
