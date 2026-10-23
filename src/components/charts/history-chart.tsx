'use client';

import { useState } from 'react';

import type { Measure } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Room above the highest reading, so a steady line doesn't run along the top edge. */
const HEADROOM = 1.25;

/** Readings over longer than this say which day they're from, not just the time. */
const DAYS_MS = 20 * 60 * 60_000;

/** Readings further apart than this many of their usual steps have a gap between. */
const GAP_STEPS = 3;

/** The usual time between readings: the middle of the steps between them. */
function usualStep(times: number[]) {
  const steps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] ?? 0;
}

/**
 * A line's runs of readings, each drawn on its own, so a gap shows as one:
 * where there's no reading, or where readings stopped for a while, as
 * while nobody was watching.
 */
function runs(values: (number | null)[], times: number[]) {
  const gap = usualStep(times) * GAP_STEPS;
  const found: { start: number; values: number[] }[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const last = found.at(-1);
    const next = last && last.start + last.values.length === i;
    if (next && times[i] - times[i - 1] <= gap) last.values.push(v);
    else found.push({ start: i, values: [v] });
  });
  return found;
}

type ChartSeries = {
  label: string;
  /** Null where there's no reading, as while the dashboard was down: a gap in the line */
  values: (number | null)[];
  measure: Measure;
  /** Drawn dashed and fainter, to tell it from a solid one beside it */
  dashed?: boolean;
  /** Drawn thin and faint, one of many behind a solid one, such as each core behind their total */
  faint?: boolean;
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
    Math.max(
      ...series.flatMap((s) => s.values.filter((v) => v !== null)),
      ...series.map((s) => s.measure.floor)
    ) * HEADROOM;
  // Positions in percent of the chart, so the line and markers stretch with it
  // Along by when each was taken, so a pause takes the room it lasted
  const span = times[count - 1] - times[0] || 1;
  const x = (i: number) => ((times[i] - times[0]) / span) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const shown = index === undefined ? undefined : Math.min(index, count - 1);
  const days = times[count - 1] - times[0] > DAYS_MS;

  function pointAt(clientX: number, element: HTMLElement) {
    const { left, width } = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    // The reading nearest that moment
    const at = times[0] + ratio * span;
    let nearest = 0;
    times.forEach((t, i) => {
      if (Math.abs(t - at) < Math.abs(times[nearest] - at)) nearest = i;
    });
    setIndex(nearest);
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
      // A tap shows the moment under it too, and on a touch screen it stays
      // once the finger lifts, until something else is tapped (the blur)
      onPointerDown={(e) => pointAt(e.clientX, e.currentTarget)}
      onPointerMove={(e) => pointAt(e.clientX, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setIndex(undefined)}
      onFocus={() => setIndex((i) => i ?? count - 1)}
      onBlur={() => setIndex(undefined)}
      onKeyDown={onKeyDown}
      // A finger dragging sideways moves along it rather than scrolling, up
      // and down still scrolls the page, and holding it selects no text
      className={cn(
        'relative h-6 w-full touch-pan-y rounded-sm text-muted-foreground outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring',
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
        {series.flatMap((s) =>
          runs(s.values, times).map((run) => {
            // A reading alone between gaps is a dot: a line of no length,
            // its round ends making one, as a circle would stretch with the box
            const alone = run.values.length === 1;
            const points = (alone ? [run.values[0], run.values[0]] : run.values)
              .map((v, i) => `${x(run.start + (alone ? 0 : i))},${y(v)}`)
              .join(' ');
            return (
              <polyline
                key={`${s.label} ${run.start}`}
                points={points}
                fill='none'
                stroke='currentColor'
                strokeWidth={alone ? 3 : s.faint ? 1 : 1.5}
                strokeLinecap={alone ? 'round' : undefined}
                strokeLinejoin='round'
                vectorEffect='non-scaling-stroke'
                strokeDasharray={s.dashed && !alone ? '3 3' : undefined}
                className={cn(
                  s.dashed && 'opacity-50',
                  s.faint && 'opacity-30'
                )}
              />
            );
          })
        )}
      </svg>
      {shown !== undefined && (
        <>
          {series
            .filter((s) => !s.faint && s.values[shown] != null)
            .map((s) => (
              <span
                key={s.label}
                aria-hidden
                className='pointer-events-none absolute size-1.5 -translate-1/2 rounded-full bg-foreground'
                style={{
                  left: `${x(shown)}%`,
                  top: `${y(s.values[shown]!)}%`,
                }}
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
                  {days
                    ? new Date(times[shown]).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : new Date(times[shown]).toLocaleTimeString()}
                </span>
                {series.map((s) => (
                  <span key={s.label} className='flex items-center gap-2'>
                    <span
                      aria-hidden
                      className={cn(
                        'w-3 border-t-2 border-current',
                        s.dashed && 'border-dashed opacity-50',
                        s.faint && 'border-t opacity-30'
                      )}
                    />
                    <span className='font-mono font-medium tabular-nums'>
                      {s.values[shown] == null
                        ? 'No reading'
                        : s.measure.format(s.values[shown])}
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
