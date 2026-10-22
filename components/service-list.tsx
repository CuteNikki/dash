import { EyeOffIcon } from 'lucide-react';

import { formatAddress, formatBytes, formatCpu, MEASURES } from '@/lib/format';
import type { ServiceGroup } from '@/lib/groups';
import { isRunning, stateLabel } from '@/lib/status';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ServiceIcon } from '@/components/service-icon';
import { Sparkline } from '@/components/sparkline';
import { StatusDot } from '@/components/status-dot';

/**
 * Every service as a row in its group's table: what it is, where it's
 * reached, how it is and what it uses, in less room than tiles. On a phone,
 * just its name, its state and its numbers. A row opens what a tile does.
 */
export function ServiceList({
  groups,
  editing,
  onOpen,
}: {
  groups: ServiceGroup[];
  editing: boolean;
  onOpen: (service: Service) => void;
}) {
  return (
    // Two columns of groups on the widest screens, rather than rows stretched
    // across them, each group kept whole
    <div className='gap-6 min-[116rem]:columns-2'>
      {groups.map((group) => (
        <section
          key={group.name}
          aria-label={group.name}
          className='mb-8 flex break-inside-avoid flex-col gap-3 last:mb-0'
        >
          <h2 className='flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {group.name}
            <span className='font-mono tracking-normal tabular-nums'>
              {group.services.length}
            </span>
          </h2>
          <div className='overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10'>
            {/* Fixed columns, so every group's line up with the others' */}
            <table className='w-full table-fixed text-xs'>
              <colgroup>
                <col />
                <col className='hidden w-[28%] md:table-column' />
                <col className='hidden w-28 sm:table-column' />
                <col className='w-14' />
                <col className='w-18' />
                <col className='hidden w-24 lg:table-column' />
              </colgroup>
              <tbody>
                {group.services.map((service) => (
                  <Row
                    key={service.key}
                    service={service}
                    editing={editing}
                    onOpen={onOpen}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({
  service,
  editing,
  onOpen,
}: {
  service: Service;
  editing: boolean;
  onOpen: (service: Service) => void;
}) {
  const running = isRunning(service.state);
  const usage = running ? service.usage : undefined;
  const address = service.addresses[0];
  return (
    <tr
      tabIndex={0}
      aria-label={editing ? `Edit ${service.name}` : service.name}
      data-dimmed={!running || service.hidden}
      onClick={() => onOpen(service)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(service);
        }
      }}
      className='cursor-pointer border-b outline-none last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[dimmed=true]:*:opacity-60'
    >
      <td className='px-3 py-2'>
        <div className='flex items-center gap-3'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
            missing={service.iconMissing}
            name={service.name}
            className='size-5'
          />
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <span className='truncate text-sm font-medium'>
                {service.name}
              </span>
              {service.hidden && (
                <EyeOffIcon
                  aria-label='Hidden'
                  className='size-3.5 shrink-0 text-muted-foreground'
                />
              )}
              {/* Where there's no column for its state */}
              <StatusDot state={service.state} className='sm:hidden' />
            </div>
            {service.description && (
              <div className='truncate text-muted-foreground'>
                {service.description}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className='hidden truncate px-2 py-2 text-muted-foreground md:table-cell'>
        {address &&
          (service.url === address ? (
            <a
              href={address}
              target='_blank'
              rel='noreferrer'
              // Opens the link, not the service
              onClick={(e) => e.stopPropagation()}
              className='hover:text-foreground hover:underline'
            >
              {formatAddress(address)}
            </a>
          ) : (
            formatAddress(address)
          ))}
      </td>
      <td className='hidden px-2 py-2 sm:table-cell'>
        <span className='flex items-center gap-2'>
          <StatusDot state={service.state} />
          <span className='truncate text-muted-foreground'>
            {stateLabel(service.state)}
          </span>
        </span>
      </td>
      <td
        className={cn(
          'px-2 py-2 text-right font-mono tabular-nums',
          !usage && 'text-muted-foreground'
        )}
      >
        {usage ? formatCpu(usage.cpu) : '–'}
      </td>
      <td
        className={cn(
          'px-2 py-2 pr-3 text-right font-mono tabular-nums lg:pr-2',
          !usage && 'text-muted-foreground'
        )}
      >
        {usage ? formatBytes(usage.memory) : '–'}
      </td>
      <td className='hidden py-2 pr-3 pl-2 lg:table-cell'>
        {usage && (
          <Sparkline
            values={usage.history.cpu}
            measure={MEASURES.cpu}
            className='w-full'
          />
        )}
      </td>
    </tr>
  );
}
