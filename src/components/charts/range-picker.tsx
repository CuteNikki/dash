'use client';

import { useTranslations } from 'next-intl';

import type { HistoryRange } from '@/lib/monitor/ranges';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** Each range's label, by its key in the messages. */
const LABELS = {
  live: 'label.live',
  '1h': 'label.1h',
  '6h': 'label.6h',
  '24h': 'label.24h',
  '7d': 'label.7d',
  '30d': 'label.30d',
} as const satisfies Record<HistoryRange | 'live', string>;

/**
 * How far back charts look: the ranges given, and "10 min" first for the
 * live readings when there are some.
 */
export function RangePicker<R extends HistoryRange | 'live'>({
  ranges,
  value,
  onChangeAction,
}: {
  ranges: readonly R[];
  value: R;
  onChangeAction: (range: R) => void;
}) {
  const t = useTranslations('ranges');
  return (
    <ToggleGroup
      type='single'
      size='sm'
      variant='segmented'
      value={value}
      // Picking the shown one again would unpick it; keep one picked
      onValueChange={(v) => v && onChangeAction(v as R)}
      aria-label={t('pick')}
    >
      {ranges.map((r) => (
        <ToggleGroupItem key={r} value={r}>
          {t(LABELS[r as HistoryRange | 'live'])}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
