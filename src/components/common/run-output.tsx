'use client';

import { useMemo } from 'react';

import { parseLogLine } from '@/lib/log-lines';

import { LogBox } from '@/components/common/log-box';

/**
 * What a job on the server prints as it goes, shown as a container's log is:
 * filtered, wrapped or not, following the newest line. Before the first
 * line, what it's doing.
 */
export function RunOutput({
  lines,
  placeholder = 'Starting…',
}: {
  lines: string[];
  placeholder?: string;
}) {
  // Again as lines come in, which is cheap for the few hundred a job prints
  const parsed = useMemo(
    () => lines.map((line, i) => parseLogLine(i, line)),
    [lines]
  );
  return (
    <LogBox
      lines={parsed}
      label='output'
      className='shrink-0'
      boxClassName='h-60 flex-none'
      empty={<p className='text-muted-foreground'>{placeholder}</p>}
    />
  );
}
