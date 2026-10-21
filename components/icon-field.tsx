'use client';

import { useMemo } from 'react';
import useSWR from 'swr';

import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

import { ServiceIcon } from '@/components/service-icon';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/** Icons shown at once; typing narrows them down. */
const MAX_SUGGESTIONS = 48;

/**
 * An icon by name, with matching dashboard-icons to pick from below. Any
 * name the tile understands works: "mdi-…", "si-…" or an https:// address.
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
  const { data: icons } = useSWR<string[]>('/api/icons', fetcher, {
    revalidateOnFocus: false,
  });
  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    const all = icons ?? [];
    const found = query ? all.filter((n) => n.includes(query)) : all;
    // The closest names first: exact, then starting with what's typed
    return found
      .toSorted(
        (a, b) =>
          Number(b === query) - Number(a === query) ||
          Number(b.startsWith(query)) - Number(a.startsWith(query))
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [icons, query]);

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
          placeholder='jellyfin, mdi-server, si-discord or a link'
          autoComplete='off'
          spellCheck={false}
        />
      </InputGroup>
      {matches.length > 0 && (
        <div className='grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-1'>
          {matches.map((icon) => (
            <button
              key={icon}
              type='button'
              title={icon}
              aria-label={icon}
              aria-pressed={icon === value}
              onClick={() => onChange(icon)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                icon === value && 'bg-muted ring-1 ring-foreground/20'
              )}
            >
              <ServiceIcon icon={icon} name={icon} className='size-6' />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
