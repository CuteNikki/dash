import { ArrowUpCircleIcon, ArrowUpIcon } from 'lucide-react';

import type { ServiceUpdate } from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';
import { cn } from '@/lib/utils';

/**
 * That a service has an update waiting, and what it is on hover. On an
 * icon's corner, a solid dot ringed in the card's color, as the state's is,
 * so it stands out on any icon, blue ones too.
 */
export function UpdateBadge({
  update,
  corner,
  className,
}: {
  update: ServiceUpdate;
  /** On an icon's corner, rather than beside text */
  corner?: boolean;
  className?: string;
}) {
  const label = `Update: ${updateLabel(update)}`;
  if (corner) {
    return (
      <span
        role='img'
        aria-label={label}
        title={label}
        className={cn(
          'flex size-3.5 items-center justify-center rounded-full bg-update text-background ring-2 ring-card',
          className
        )}
      >
        <ArrowUpIcon className='size-2.5' strokeWidth={3} />
      </span>
    );
  }
  return (
    <ArrowUpCircleIcon
      role='img'
      aria-label={label}
      className={cn('size-3.5 shrink-0 text-update', className)}
    >
      <title>{label}</title>
    </ArrowUpCircleIcon>
  );
}
