'use client';

import { HISTORY_RANGES, type HistoryRange } from '@/lib/monitor/ranges';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  return (
    <ToggleGroup
      type='single'
      size='sm'
      variant='segmented'
      value={value}
      // Picking the shown one again would unpick it; keep one picked
      onValueChange={(v) => v && onChangeAction(v as R)}
      aria-label='How far back'
    >
      {ranges.map((r) => (
        <ToggleGroupItem key={r} value={r}>
          {r === 'live' ? '10 min' : HISTORY_RANGES[r as HistoryRange].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
