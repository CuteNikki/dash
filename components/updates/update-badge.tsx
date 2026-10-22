import { ArrowUpCircleIcon } from 'lucide-react';

import type { ServiceUpdate } from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';

/** That a service has an update waiting, and what it is on hover. */
export function UpdateBadge({ update }: { update: ServiceUpdate }) {
  const label = `Update: ${updateLabel(update)}`;
  return (
    <ArrowUpCircleIcon
      role='img'
      aria-label={label}
      className='size-3.5 shrink-0 text-update'
    >
      <title>{label}</title>
    </ArrowUpCircleIcon>
  );
}
