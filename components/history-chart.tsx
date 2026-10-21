'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** The smallest top of the scale, so an idle line stays flat rather than filling the height. */
const MIN_SCALE = 1;
/** Room above the highest reading, so a steady line doesn't run along the top edge. */
const HEADROOM = 1.25;

export type ChartSeries = {
  label: string;
  values: number[];
  format: (value: number) => string;
  /** Drawn dashed and fainter, to tell it from a solid one beside it */
  dashed?: boolean;
};

/**
 * Recent readings as lines on one scale. Hovering, or the arrow keys once it
 * has focus, shows what each line read at that moment.
 */
export function HistoryChart({
  times,
  series,
  label,
  className,
}: {
  /** When each reading was taken, in milliseconds */
  times: number[];
  series: ChartSeries[];
  /** What the chart shows, for screen readers */
  label: string;
  className?: string;
}) {
  const [index, setIndex] = useState<number>();
  const count = times.length;
  if (count < 2) return null;

  const top =
    Math.max(...series.flatMap((s) => s.values), MIN_SCALE) * HEADROOM;
  // Positions in percent of the chart, so the line and markers stretch with it
  const x = (i: number) => (i / (count - 1)) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const shown = index === undefined ? undefined : Math.min(index, count - 1);

  function pointAt(clientX: number, element: HTMLElement) {
    const { left, width } = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    setIndex(Math.round(ratio * (count - 1)));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (step) {
      e.preventDefault();
      setIndex((i) =>
        Math.min(count - 1, Math.max(0, (i ?? count - 1) + step))
      );
    } else if (e.key === 'Escape') {
      setIndex(undefined);
    }
  }

  return (
    <div
      role='img'
      aria-label={label}
      tabIndex={0}
      onPointerMove={(e) => pointAt(e.clientX, e.currentTarget)}
      onPointerLeave={() => setIndex(undefined)}
      onFocus={() => setIndex((i) => i ?? count - 1)}
      onBlur={() => setIndex(undefined)}
      onKeyDown={onKeyDown}
      className={cn(
        'relative h-6 w-full rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {/* Drawn on a 100 × 100 box that stretches to the element's size */}
      <svg
        viewBox='0 0 100 100'
        preserveAspectRatio='none'
        aria-hidden
        className='size-full overflow-visible'
      >
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill='none'
            stroke='currentColor'
            strokeWidth={1.5}
            strokeLinejoin='round'
            vectorEffect='non-scaling-stroke'
            strokeDasharray={s.dashed ? '3 3' : undefined}
            className={cn(s.dashed && 'opacity-50')}
          />
        ))}
      </svg>
      {shown !== undefined && (
        <>
          {series.map((s) => (
            <span
              key={s.label}
              aria-hidden
              className='pointer-events-none absolute size-1.5 -translate-1/2 rounded-full bg-foreground'
              style={{ left: `${x(shown)}%`, top: `${y(s.values[shown])}%` }}
            />
          ))}
          <Tooltip open>
            <TooltipTrigger asChild>
              <span
                aria-hidden
                className='pointer-events-none absolute inset-y-0 w-px bg-foreground/30'
                style={{ left: `${x(shown)}%` }}
              />
            </TooltipTrigger>
            <TooltipContent side='top' updatePositionStrategy='always'>
              <div className='flex flex-col gap-1'>
                <span className='opacity-70'>
                  {new Date(times[shown]).toLocaleTimeString()}
                </span>
                {series.map((s) => (
                  <span key={s.label} className='flex items-center gap-2'>
                    <span
                      aria-hidden
                      className={cn(
                        'w-3 border-t-2 border-current',
                        s.dashed && 'border-dashed opacity-50'
                      )}
                    />
                    <span className='font-mono font-medium tabular-nums'>
                      {s.format(s.values[shown])}
                    </span>
                    {series.length > 1 && (
                      <span className='opacity-70'>{s.label}</span>
                    )}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
