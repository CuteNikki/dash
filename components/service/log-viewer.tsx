'use client';

import { useEffect, useState } from 'react';

import { parseLogLine, type LogLine } from '@/lib/log-lines';

import { LogBox } from '@/components/common/log-box';
import { CodeSkeleton } from '@/components/common/skeletons';
import { ConsoleInput } from '@/components/service/console-input';

/** Lines kept in the viewer; older ones drop off the top. */
const MAX_LINES = 2_000;

/**
 * A container's log, following new lines as they're written, with a line to
 * type commands into under it for one whose console takes them. Keyed by
 * container, so a new one starts empty.
 */
export function LogViewer({
  containerId,
  commands,
}: {
  containerId: string;
  /** Its console takes commands: whether it's running to take them now */
  commands?: { running: boolean };
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string>();
  // Until the first lines (or the news that there are none) come in
  const [loaded, setLoaded] = useState(false);
  const [follow, setFollow] = useState(true);

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
        setLoaded(true);
        if (done) break;
        const parts = (rest + value).split('\n');
        rest = parts.pop() ?? '';
        const parsed = parts
          .filter(Boolean)
          .map((p) => parseLogLine(next++, JSON.parse(p).line));
        setLines((old) => [...old, ...parsed].slice(-MAX_LINES));
      }
    })().catch((e: Error) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => abort.abort();
  }, [containerId]);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <LogBox
        lines={error ? [] : lines}
        label='logs'
        follow={follow}
        onFollowChange={setFollow}
        className='flex-1'
        empty={
          error ? (
            <p className='text-destructive'>{error}</p>
          ) : !loaded ? (
            <CodeSkeleton lines={20} className='h-auto bg-transparent p-0' />
          ) : (
            <p className='text-muted-foreground'>No log lines yet.</p>
          )
        }
      />
      {commands && (
        <ConsoleInput
          containerId={containerId}
          running={commands.running}
          // Back to the end, where the reply comes in
          onSent={() => setFollow(true)}
        />
      )}
    </div>
  );
}
