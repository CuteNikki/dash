'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import useSWR from 'swr';

import type { Format } from '@/i18n/format';
import { useFormat } from '@/i18n/use-format';

import { fetcher } from '@/lib/fetcher';
import { MEASURES, type Measure } from '@/lib/format';
import type { HistoryRange } from '@/lib/monitor/ranges';
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
  const t = useTranslations('history');
  const tr = useTranslations('ranges');
  const [range, setRange] = useState<HistoryRange>('24h');
  const { data, error } = useSWR<HostHistory>(
    open ? `/api/history?range=${range}` : null,
    fetcher,
    { refreshInterval: REFRESH_MS, keepPreviousData: true }
  );
  const words = tr(`words.${range}`);

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
      title: t('cpu'),
      measure: MEASURES.serverCpu,
      lines: (h) => [{ label: t('cpu'), values: h.cpu }],
    },
    {
      // The provider's other machines' share of this one's CPU; a stall
      // here, not in the disk's wait, is the host being busy elsewhere
      title: t('steal'),
      measure: MEASURES.steal,
      lines: (h) => [{ label: t('taken'), values: h.steal }],
      peak: true,
    },
    {
      title: t('memory'),
      measure: host
        ? { ...MEASURES.memory, floor: host.memory.total }
        : MEASURES.memory,
      lines: (h) => [{ label: t('memory'), values: h.memory }],
    },
    {
      title: t('diskSpace'),
      // Against the disk's size, so it climbs toward the top as it fills
      measure: host
        ? { format: MEASURES.memory.format, floor: host.disk.total }
        : MEASURES.memory,
      lines: (h) => [{ label: t('used'), values: h.diskUsed }],
      latest: true,
    },
    {
      title: t('load'),
      measure: MEASURES.load,
      lines: (h) => [{ label: t('load'), values: h.load }],
    },
    {
      title: t('diskWait'),
      measure: MEASURES.diskWait,
      lines: (h) => [{ label: t('perReadWrite'), values: h.diskWait }],
      peak: true,
    },
    {
      title: t('diskIo'),
      measure: MEASURES.disk,
      lines: (h) => [
        { label: t('write'), values: h.diskWritten },
        { label: t('read'), values: h.diskRead, dashed: true },
      ],
    },
    {
      title: t('network'),
      measure: MEASURES.network,
      lines: (h) => [
        { label: t('download'), values: h.received },
        { label: t('upload'), values: h.sent, dashed: true },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCloseAction()}>
      <DialogContent className='flex max-h-[90dvh] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { words })}</DialogDescription>
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
  const t = useTranslations('history');
  const tr = useTranslations('ranges');
  const format = useFormat();
  const first = lines?.[0].values.filter((v) => v !== null) ?? [];
  const summary = !lines
    ? undefined
    : !first.length
      ? t('noReadings')
      : latest
        ? t('now', {
            value: measure.format(first.at(-1)!, format),
            change: changeOf(first, measure, format, t),
          })
        : peak
          ? t('atWorst', { value: measure.format(Math.max(...first), format) })
          : t('onAverage', {
              value: measure.format(
                first.reduce((a, b) => a + b, 0) / first.length,
                format
              ),
            });
  return (
    <Panel title={title}>
      <span className='-mt-1 text-muted-foreground'>
        {summary ?? <TextSkeleton className='w-24' />}
      </span>
      <div className='h-24'>
        {times && lines && (
          <HistoryChart
            label={tr('over', { label: title, words })}
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
function changeOf(
  values: number[],
  measure: Measure,
  format: Format,
  t: ReturnType<typeof useTranslations<'history'>>
) {
  const change = values.at(-1)! - values[0];
  if (Math.abs(change) < 1024 * 1024) return t('noChange');
  const value = measure.format(Math.abs(change), format);
  return change > 0 ? t('up', { value }) : t('down', { value });
}
