'use client';

import { cva } from 'class-variance-authority';
import { useTranslations } from 'next-intl';

import { healthOf, type StatusKey } from '@/lib/dashboard/status';
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
  label: key = state,
  className,
}: {
  state: ContainerState;
  /** What its state is called, when not as a container's is */
  label?: StatusKey;
  className?: string;
}) {
  const t = useTranslations('status');
  const label = t(key);
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
  label: key = state,
  className,
}: {
  state: ContainerState;
  /** What its state is called, when not as a container's is */
  label?: StatusKey;
  className?: string;
}) {
  const t = useTranslations('status');
  const label = t(key);
  const health = healthOf(state);
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 font-medium',
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
