'use client';

import { useDeferredValue } from 'react';
import useSWR from 'swr';

import { fetcher } from '@/lib/fetcher';
import type { IconMatch } from '@/lib/icon-search';
import { cn } from '@/lib/utils';

import { ServiceIcon } from '@/components/service-icon';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/**
 * An icon by name, with matches from every icon set to pick from below. Any
 * name the tile understands works: "mdi-…", "si-…", "sh-…" or an https://
 * address.
 */
export function IconField({
  id,
  value,
  name,
  onChange,
}: {
  id: string;
  value: string;
  /** The tile's name, for the letter shown while there's no icon */
  name: string;
  onChange: (icon: string) => void;
}) {
  // Searches as typing pauses, keeping the last matches up meanwhile
  const query = useDeferredValue(value.trim());
  const { data: matches = [] } = useSWR<IconMatch[]>(
    /^https:\/\//.test(query)
      ? null
      : `/api/icons?q=${encodeURIComponent(query)}`,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  return (
    <div className='flex flex-col gap-2'>
      <InputGroup>
        <InputGroupAddon>
          <ServiceIcon icon={value} name={name} className='size-4' />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='Search icons, or paste a link to one'
          autoComplete='off'
          spellCheck={false}
        />
      </InputGroup>
      {matches.length > 0 && (
        <div className='grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-1'>
          {matches.map((match) => (
            <button
              key={match.icon}
              type='button'
              title={`${match.icon} (${match.label})`}
              aria-label={match.icon}
              aria-pressed={match.icon === value}
              onClick={() => onChange(match.icon)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                match.icon === value && 'bg-muted ring-1 ring-foreground/20'
              )}
            >
              <ServiceIcon
                icon={match.icon}
                name={match.icon}
                className='size-6'
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
