import type { Measure } from '@/lib/format';
import { cn } from '@/lib/utils';

import { fitRange } from '@/components/charts/fit';

/**
 * A small line of recent values, drawn in the current text color, along by
 * when each was taken: readings come at different paces, as a minute each
 * from the record before live ones every few seconds.
 */
export function Sparkline({
  values,
  times,
  measure,
  fit,
  className,
}: {
  values: number[];
  /** When each was taken, in milliseconds since 1970 */
  times: number[];
  measure: Measure;
  /** Scaled to its readings, not from nothing, to show the shape of what barely moves, as memory */
  fit?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  const { bottom, top } = fit
    ? fitRange(values, 1)
    : { bottom: 0, top: Math.max(...values, measure.floor) };
  // Readings of nothing at all, fitted, have no spread to scale by
  const range = top - bottom || 1;
  const first = times[0];
  const span = times[times.length - 1] - first || 1;
  // Drawn on a 100 × 100 box that stretches to the element's size
  const points = values
    .map(
      (v, i) =>
        `${((times[i] - first) / span) * 100},${100 - ((v - bottom) / range) * 100}`
    )
    .join(' ');
  return (
    <svg
      viewBox='0 0 100 100'
      preserveAspectRatio='none'
      aria-hidden
      className={cn(
        'h-5 w-16 overflow-visible text-muted-foreground',
        className
      )}
    >
      <polyline
        points={points}
        fill='none'
        stroke='currentColor'
        strokeWidth={1.5}
        strokeLinejoin='round'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}
