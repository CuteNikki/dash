import { cva } from 'class-variance-authority';

import { healthOf, stateLabel } from '@/lib/dashboard/status';
import type { ContainerState } from '@/lib/docker/docker';
import { cn } from '@/lib/utils';

const dot = cva('inline-block size-2 shrink-0 rounded-full', {
  variants: {
    health: {
      ok: 'bg-success',
      attention: 'bg-warning',
      off: 'bg-muted-foreground/40',
    },
  },
});

export function StatusDot({
  state,
  label = stateLabel(state),
  className,
}: {
  state: ContainerState;
  /** What its state is called, when not as a container's is */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role='img'
      aria-label={label}
      title={label}
      className={cn(dot({ health: healthOf(state) }), className)}
    />
  );
}

/** Its state as a word in a pill, colored as its dot would be. */
export function StatePill({
  state,
  label = stateLabel(state),
  className,
}: {
  state: ContainerState;
  /** What its state is called, when not as a container's is */
  label?: string;
  className?: string;
}) {
  const health = healthOf(state);
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-1.5 py-0.5 font-medium',
        health === 'ok' && 'bg-success/15 text-success',
        health === 'attention' && 'bg-warning/15 text-warning',
        health === 'off' && 'bg-muted text-muted-foreground',
        className
      )}
    >
      {label.toLowerCase()}
    </span>
  );
}
