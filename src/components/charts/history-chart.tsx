'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { useFormat } from '@/i18n/use-format';

import type { Measure } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Room above the highest reading, so a steady line doesn't run along the top edge. */
const HEADROOM = 1.25;
/** A fitted scale spans at least this share of its highest reading */
const FIT_LEAST_SPAN = 0.1;

/** Readings over longer than this say which day they're from, not just the time. */
const DAYS_MS = 20 * 60 * 60_000;

/** Readings further apart than this many of the steps before have a gap between. */
const GAP_STEPS = 3;

/**
 * Where readings stopped for a while, as while nobody was watching: a step
 * longer than a few of the ones before it, as they're taken at different
 * paces, a live graph's minutes from the record before its seconds. The
 * first steps go by the shorter of the first two, so a pause right after the
 * first reading shows too.
 */
export function pauses(times: number[]) {
  const steps = times.slice(1).map((t, i) => t - times[i]);
  const found = new Set<number>();
  let pace = Math.min(steps[0] ?? 0, steps[1] ?? Infinity);
  steps.forEach((step, i) => {
    if (step > pace * GAP_STEPS) found.add(i + 1);
    else pace = step;
  });
  return found;
}

/**
 * A line's runs of readings, each drawn on its own, so a gap shows as one:
 * where there's no reading, or where readings stopped for a while.
 */
function runs(values: (number | null)[], times: number[]) {
  const paused = pauses(times);
  const found: { start: number; values: number[] }[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const last = found.at(-1);
    const next = last && last.start + last.values.length === i;
    if (next && !paused.has(i)) last.values.push(v);
    else found.push({ start: i, values: [v] });
  });
  return found;
}

/** How strong a lone line's fill is just under it, before it fades away below */
const FILL_TOP = 0.25;

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
 * Recent readings as lines on one scale. Hovering, a tap, or the arrow keys
 * once it has focus, shows what each line read at that moment.
 */
export function HistoryChart({
  times,
  series,
  label,
  fit,
  className,
}: {
  /** When each reading was taken, in milliseconds */
  times: number[];
  series: ChartSeries[];
  /** What the chart shows, for screen readers */
  label: string;
  /**
   * Scaled from its lowest reading to its highest rather than from nothing,
   * for what's never near nothing, such as memory: its shape shows
   */
  fit?: boolean;
  className?: string;
}) {
  const t = useTranslations('common');
  const format = useFormat();
  const [index, setIndex] = useState<number>();
  // Its own name for the fill's fade, as a page has several charts
  const fade = useId();
  const ref = useRef<HTMLDivElement>(null);
  const showing = index !== undefined;
  // Gone once anything else is touched, the tooltip or another chart
  // included, or the chart's scrolled along with what it's in: Safari on a
  // phone neither focuses the chart when it's tapped nor blurs it when
  // something else is. A log beside it scrolling on its own leaves it be.
  // Once the finger lifts rather than as it lands: gone as it lands, a
  // dialog it's in would take a tap on it for one outside, and close.
  useEffect(() => {
    if (!showing) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIndex(undefined);
    };
    const scrolled = (e: Event) => {
      const target = e.target as Node;
      if (target === document || target.contains(ref.current)) {
        setIndex(undefined);
      }
    };
    document.addEventListener('pointerup', outside, true);
    document.addEventListener('scroll', scrolled, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('pointerup', outside, true);
      document.removeEventListener('scroll', scrolled, true);
    };
  }, [showing]);
  const count = times.length;
  if (count < 2) return null;

  const readings = series.flatMap((s) =>
    s.values.filter((v): v is number => v !== null)
  );
  const highest = Math.max(...readings, ...series.map((s) => s.measure.floor));
  // Fitted, the scale spans at least a share of the value, so a wobble of a
  // few bytes stays a wobble, and has room above and below the line
  const least = Math.max(...readings) * FIT_LEAST_SPAN;
  const fitted = Math.max(Math.max(...readings) - Math.min(...readings), least);
  const middle = (Math.max(...readings) + Math.min(...readings)) / 2;
  const bottom = fit ? Math.max(0, middle - (fitted * HEADROOM) / 2) : 0;
  const top = fit ? bottom + fitted * HEADROOM : highest * HEADROOM;
  // Positions in percent of the chart, so the line and markers stretch with it
  // Along by when each was taken, so a pause takes the room it lasted
  const span = times[count - 1] - times[0] || 1;
  const x = (i: number) => ((times[i] - times[0]) / span) * 100;
  const y = (v: number) => 100 - ((v - bottom) / (top - bottom || 1)) * 100;
  const shown = index === undefined ? undefined : Math.min(index, count - 1);
  const days = times[count - 1] - times[0] > DAYS_MS;
  const fillable = series.length === 1;

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
      ref={ref}
      role='img'
      aria-label={label}
      tabIndex={0}
      // A tap shows the moment under it too, and on a touch screen it stays
      // once the finger lifts, until something else is tapped or it scrolls;
      // a finger that starts scrolling the page from it hides it at once
      onPointerDown={(e) => pointAt(e.clientX, e.currentTarget)}
      onPointerMove={(e) => pointAt(e.clientX, e.currentTarget)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setIndex(undefined)}
      onPointerCancel={() => setIndex(undefined)}
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
        {/* The fill below a line, faint under it and gone at the bottom */}
        <defs>
          <linearGradient id={fade} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='currentColor' stopOpacity={FILL_TOP} />
            <stop offset='1' stopColor='currentColor' stopOpacity={0} />
          </linearGradient>
        </defs>
        {series.flatMap((s) =>
          runs(s.values, times).map((run) => {
            // A reading alone between gaps is a dot: a line of no length,
            // its round ends making one, as a circle would stretch with the box
            const alone = run.values.length === 1;
            const points = (alone ? [run.values[0], run.values[0]] : run.values)
              .map((v, i) => `${x(run.start + (alone ? 0 : i))},${y(v)}`)
              .join(' ');
            const end = run.start + run.values.length - 1;
            return (
              <Fragment key={`${s.label} ${run.start}`}>
                {/* A line alone in its chart is filled below, to read at a
                    glance; with others beside it, fills would only blur together */}
                {fillable && !alone && (
                  <polygon
                    points={`${points} ${x(end)},100 ${x(run.start)},100`}
                    fill={`url(#${fade})`}
                  />
                )}
                <polyline
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
              </Fragment>
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
                    ? new Date(times[shown]).toLocaleString(format.locale, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : new Date(times[shown]).toLocaleTimeString(format.locale)}
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
                        ? t('noReading')
                        : s.measure.format(s.values[shown], format)}
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
