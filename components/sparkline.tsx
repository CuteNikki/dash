import { cn } from '@/lib/utils';

/** The smallest top of the scale, so an idle line stays flat rather than filling the height. */
const MIN_SCALE = 1;

/** A small line of recent values, drawn in the current text color. */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const top = Math.max(...values, MIN_SCALE);
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
