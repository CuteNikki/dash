'use client';

import { countOf, useWords } from '@/i18n/use-words';

import { isRunning } from '@/lib/dashboard/status';
import type { Service, WidgetStat } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Its app's numbers while it runs; ones that couldn't be read leave nothing, why being in /api/services. */
export function widgetStats(service: Service) {
  const widget = isRunning(service.state) ? service.widget : undefined;
  return widget && 'stats' in widget ? widget.stats : undefined;
}

/** An app's numbers as chips, each its value then its label, wrapping as needed. */
export function WidgetStats({
  stats,
  className,
}: {
  stats: WidgetStat[];
  className?: string;
}) {
  const words = useWords();
  return (
    <dl className={cn('flex flex-wrap gap-1.5', className)}>
      {stats.map((stat) => {
        const value = words.value(stat.value);
        return (
          <div
            key={stat.label}
            className={cn(
              // No wider than the room it has: a long value cuts short
              // inside it, rather than spilling past its column
              'flex max-w-full min-w-0 flex-row-reverse gap-1.5 rounded-md bg-muted px-1.5',
              // On air, in the red streams use for it
              stat.tone === 'live' && 'bg-destructive/15 text-destructive'
            )}
          >
            {stat.bare ? (
              // Said for a screen reader, which can't see what the value is
              <dt className='sr-only'>{words.label(stat.label)}</dt>
            ) : (
              // Gives way first, all the way to nothing: the number's what
              // the pill is for. In each language's own case, as German's
              // nouns start with a capital
              <dt className='min-w-0 shrink-999 truncate text-muted-foreground'>
                {words.label(stat.label, countOf(stat))}
              </dt>
            )}
            <dd
              className={cn(
                'flex min-w-0 items-center gap-1 font-mono font-medium whitespace-nowrap tabular-nums',
                stat.tone === 'off' && 'font-normal text-muted-foreground'
              )}
            >
              {stat.tone === 'live' && (
                <span
                  aria-hidden
                  className='size-1.5 rounded-full bg-destructive motion-safe:animate-pulse'
                />
              )}
              <span className='truncate' title={value}>
                {value}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
