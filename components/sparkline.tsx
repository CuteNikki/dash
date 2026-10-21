import type { Measure } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A small line of recent values, drawn in the current text color. */
export function Sparkline({
  values,
  measure,
  className,
}: {
  values: number[];
  measure: Measure;
  className?: string;
}) {
  if (values.length < 2) return null;
  const top = Math.max(...values, measure.floor);
  // Drawn on a 100 × 100 box that stretches to the element's size
  const points = values
    .map(
      (v, i) => `${(i / (values.length - 1)) * 100},${100 - (v / top) * 100}`
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
