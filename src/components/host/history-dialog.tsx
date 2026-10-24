'use client';

import { useState } from 'react';
import useSWR from 'swr';

import { fetcher } from '@/lib/fetcher';
import { MEASURES, type Measure } from '@/lib/format';
import { HISTORY_RANGES, type HistoryRange } from '@/lib/monitor/ranges';
import type { HostHistory, HostStats } from '@/lib/types';

import { HistoryChart } from '@/components/charts/history-chart';
import { RangePicker } from '@/components/charts/range-picker';
import { TextSkeleton } from '@/components/common/skeletons';
import { Panel } from '@/components/service/app-details';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const RANGES = ['1h', '6h', '24h', '7d'] as const;

/** The record's newest stretch fills in as the minute's readings come. */
const REFRESH_MS = 60_000;

type Line = {
  label: string;
  values: (number | null)[];
  dashed?: boolean;
};

/**
 * The server over the last hour to the last week, from the monitor's
 * record, which is kept whether or not anyone's watching: what happened last
 * night, as a stall of the disk that froze a game server.
 */
export function HistoryDialog({
  open,
  host,
  onCloseAction,
}: {
  open: boolean;
  /** For the memory's and the disk's size, as the top of their charts */
  host?: HostStats;
  onCloseAction: () => void;
}) {
  const [range, setRange] = useState<HistoryRange>('24h');
  const { data, error } = useSWR<HostHistory>(
    open ? `/api/history?range=${range}` : null,
    fetcher,
    { refreshInterval: REFRESH_MS, keepPreviousData: true }
  );
  const words = HISTORY_RANGES[range].words;

  // In pairs, a row each: the CPU and what's taken from it; how full the
  // memory and disk are; what's waiting, as load counts what waits on the
  // disk too, beside the disk's own wait; then what goes through the disk
  // and the network
  const charts: {
    title: string;
    measure: Measure;
    lines: (h: HostHistory) => Line[];
    /** Say its highest, rather than its average */
    peak?: boolean;
    /** Say its latest, as for what's stored, which only grows or shrinks */
    latest?: boolean;
  }[] = [
    {
      title: 'CPU',
      measure: MEASURES.serverCpu,
      lines: (h) => [{ label: 'CPU', values: h.cpu }],
    },
    {
      // The provider's other machines' share of this one's CPU; a stall
      // here, not in the disk's wait, is the host being busy elsewhere
      title: 'CPU steal',
      measure: MEASURES.steal,
      lines: (h) => [{ label: 'Taken', values: h.steal }],
      peak: true,
    },
    {
      title: 'Memory',
      measure: host
        ? { ...MEASURES.memory, floor: host.memory.total }
        : MEASURES.memory,
      lines: (h) => [{ label: 'Memory', values: h.memory }],
    },
    {
      title: 'Disk space',
      // Against the disk's size, so it climbs toward the top as it fills
      measure: host
        ? { format: MEASURES.memory.format, floor: host.disk.total }
        : MEASURES.memory,
      lines: (h) => [{ label: 'Used', values: h.diskUsed }],
      latest: true,
    },
    {
      title: 'Load',
      measure: MEASURES.load,
      lines: (h) => [{ label: 'Load', values: h.load }],
    },
    {
      title: 'Disk wait',
      measure: MEASURES.diskWait,
      lines: (h) => [{ label: 'Per read or write', values: h.diskWait }],
      peak: true,
    },
    {
      title: 'Disk I/O',
      measure: MEASURES.disk,
      lines: (h) => [
        { label: 'Write', values: h.diskWritten },
        { label: 'Read', values: h.diskRead, dashed: true },
      ],
    },
    {
      title: 'Network',
      measure: MEASURES.network,
      lines: (h) => [
        { label: 'Download', values: h.received },
        { label: 'Upload', values: h.sent, dashed: true },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCloseAction()}>
      <DialogContent className='flex max-h-[90dvh] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            The server over {words}, a reading a minute, kept for a week
          </DialogDescription>
        </DialogHeader>
        <div className='flex justify-end'>
          <RangePicker
            ranges={RANGES}
            value={range}
            onChangeAction={setRange}
          />
        </div>
        {error && !data ? (
          <p className='text-destructive'>{error.message}</p>
        ) : (
          <div className='-mx-1 grid grid-cols-1 gap-3 overflow-y-auto px-1 sm:grid-cols-2'>
            {charts.map((c) => (
              <HistoryPanel
                key={c.title}
                title={c.title}
                measure={c.measure}
                peak={c.peak}
                latest={c.latest}
                times={data?.at}
                lines={data ? c.lines(data) : undefined}
                words={words}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One measure over the range: its average or highest, and a chart of it. */
function HistoryPanel({
  title,
  measure,
  peak,
  latest,
  times,
  lines,
  words,
}: {
  title: string;
  measure: Measure;
  peak?: boolean;
  latest?: boolean;
  times?: number[];
  lines?: Line[];
  words: string;
}) {
  const first = lines?.[0].values.filter((v) => v !== null) ?? [];
  const summary = !lines
    ? undefined
    : !first.length
      ? 'No readings'
      : latest
        ? `${measure.format(first.at(-1)!)} now, ${changeOf(first, measure)}`
        : peak
          ? `${measure.format(Math.max(...first))} at worst`
          : `${measure.format(first.reduce((a, b) => a + b, 0) / first.length)} on average`;
  return (
    <Panel title={title}>
      <span className='-mt-1 text-muted-foreground'>
        {summary ?? <TextSkeleton className='w-24' />}
      </span>
      <div className='h-24'>
        {times && lines && (
          <HistoryChart
            label={`${title} over ${words}`}
            times={times}
            series={lines.map((l) => ({ ...l, measure }))}
            className='h-full text-foreground'
          />
        )}
      </div>
    </Panel>
  );
}

/** How much something grew or shrank over the range: "up 2.1 GB", "no change". */
function changeOf(values: number[], measure: Measure) {
  const change = values.at(-1)! - values[0];
  if (Math.abs(change) < 1024 * 1024) return 'no change';
  return `${change > 0 ? 'up' : 'down'} ${measure.format(Math.abs(change))}`;
}
