import type { Measure } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A small line of recent values, drawn in the current text color, along by
 * when each was taken: readings come at different paces, as a minute each
 * from the record before live ones every few seconds.
 */
export function Sparkline({
  values,
  times,
  measure,
  className,
}: {
  values: number[];
  /** When each was taken, in milliseconds since 1970 */
  times: number[];
  measure: Measure;
  className?: string;
}) {
  if (values.length < 2) return null;
  const top = Math.max(...values, measure.floor);
  const first = times[0];
  const span = times[times.length - 1] - first || 1;
  // Drawn on a 100 × 100 box that stretches to the element's size
  const points = values
    .map(
      (v, i) => `${((times[i] - first) / span) * 100},${100 - (v / top) * 100}`
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
