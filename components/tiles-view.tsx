import type { ServiceGroup } from '@/lib/groups';
import type { Service } from '@/lib/types';

import { ServiceTile } from '@/components/service-tile';

export function TilesView({
  groups,
  onOpen,
}: {
  groups: ServiceGroup[];
  onOpen: (service: Service) => void;
}) {
  return (
    <div className='flex flex-col gap-8'>
      {groups.map((group) => (
        <section key={group.name} className='flex flex-col gap-3'>
          <h2 className='flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {group.name}
            <span className='font-mono tracking-normal tabular-nums'>
              {group.services.length}
            </span>
          </h2>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {group.services.map((service) => (
              <ServiceTile
                key={service.key}
                service={service}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
