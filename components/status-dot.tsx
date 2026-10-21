import { cva } from 'class-variance-authority';

import type { ContainerState } from '@/lib/docker';
import { healthOf, stateLabel } from '@/lib/status';
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
  className,
}: {
  state: ContainerState;
  className?: string;
}) {
  return (
    <span
      role='img'
      aria-label={stateLabel(state)}
      title={stateLabel(state)}
      className={cn(dot({ health: healthOf(state) }), className)}
    />
  );
}
