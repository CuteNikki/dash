import { cn } from '@/lib/utils';

/** The smallest top of the scale, so an idle line stays flat rather than filling the height. */
const MIN_SCALE = 1;

/** Points for an SVG polyline on a 100 × 100 box, against a shared top. */
function points(values: number[], top: number) {
  return values
    .map(
      (v, i) => `${(i / (values.length - 1)) * 100},${100 - (v / top) * 100}`
    )
    .join(' ');
}

/**
 * A small line of recent values, drawn in the current text color, with an
 * optional second line (dashed and fainter) on the same scale.
 */
export function Sparkline({
  values,
  second,
  className,
}: {
  values: number[];
  second?: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const top = Math.max(...values, ...(second ?? []), MIN_SCALE);
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinejoin: 'round',
    vectorEffect: 'non-scaling-stroke',
  } as const;
  return (
    // Drawn on a 100 × 100 box that stretches to the element's size
    <svg
      viewBox='0 0 100 100'
      preserveAspectRatio='none'
      aria-hidden
      className={cn(
        'h-5 w-16 overflow-visible text-muted-foreground',
        className
      )}
    >
      {second && second.length > 1 && (
        <polyline
          points={points(second, top)}
          {...line}
          strokeDasharray='3 3'
          className='opacity-50'
        />
      )}
      <polyline points={points(values, top)} {...line} />
    </svg>
  );
}
