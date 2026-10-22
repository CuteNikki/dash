import { isRunning } from '@/lib/status';
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
  return (
    <dl className={cn('flex flex-wrap gap-1.5', className)}>
      {stats.map((stat) => (
        <div
          key={stat.label ?? stat.value}
          className={cn(
            'flex min-w-0 flex-row-reverse gap-1.5 rounded-md bg-muted px-1.5',
            // On air, in the red streams use for it
            stat.tone === 'live' && 'bg-destructive/15 text-destructive'
          )}
        >
          {stat.label && (
            <dt className='truncate text-muted-foreground lowercase'>
              {stat.label}
            </dt>
          )}
          <dd
            className={cn(
              'flex items-center gap-1 font-mono font-medium whitespace-nowrap tabular-nums',
              stat.tone === 'off' && 'font-normal text-muted-foreground'
            )}
          >
            {stat.tone === 'live' && (
              <span
                aria-hidden
                className='size-1.5 rounded-full bg-destructive motion-safe:animate-pulse'
              />
            )}
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
