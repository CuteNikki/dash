'use client';

import { useDeferredValue, useState } from 'react';
import useSWR from 'swr';

import { CircleAlertIcon, CircleCheckIcon, LoaderIcon } from 'lucide-react';

import type { DomainCheck } from '@/lib/domains';
import { fetcher } from '@/lib/fetcher';
import { DOMAIN_PATTERN } from '@/lib/new-service';
import { cn } from '@/lib/utils';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** The picker's choice for typing a whole domain of one's own. */
const OTHER = 'other';

/**
 * A new service's address: a name, under one of the domains the server's
 * sites are under (or another, typed whole), and whether its DNS points at
 * this server yet, checked as typing pauses.
 */
export function AddressField({
  id,
  onChange,
  disabled,
}: {
  id: string;
  /** The whole domain, or '' for none */
  onChange: (domain: string) => void;
  disabled?: boolean;
}) {
  const { data: domains } = useSWR<string[]>('/api/domains', fetcher, {
    revalidateOnFocus: false,
  });
  const [name, setName] = useState('');
  // The server's own domain, its first, until another's picked
  const [picked, setPicked] = useState<string>();
  const zone = picked ?? domains?.[0] ?? OTHER;
  const whole = (n: string, z: string) => {
    const typed = n.trim().toLowerCase();
    return !typed ? '' : z === OTHER ? typed : `${typed}.${z}`;
  };
  const domain = whole(name, zone);

  return (
    <div className='flex flex-col gap-2'>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            onChange(whole(e.target.value, zone));
          }}
          placeholder={zone === OTHER ? 'app.example.com' : 'app'}
          className='font-mono'
          autoComplete='off'
          disabled={disabled}
        />
        <InputGroupAddon align='inline-end'>
          <Select
            value={zone}
            onValueChange={(z) => {
              setPicked(z);
              onChange(whole(name, z));
            }}
            disabled={disabled}
          >
            <SelectTrigger
              size='sm'
              aria-label='Domain'
              className='border-0 bg-transparent font-mono text-muted-foreground shadow-none dark:bg-transparent'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
              {domains?.map((d) => (
                <SelectItem key={d} value={d} className='font-mono'>
                  .{d}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Another domain</SelectItem>
            </SelectContent>
          </Select>
        </InputGroupAddon>
      </InputGroup>
      {domain && <DnsStatus domain={domain} />}
    </div>
  );
}

/** Whether a domain points at this server yet, checked as typing pauses. */
function DnsStatus({ domain }: { domain: string }) {
  const query = useDeferredValue(domain);
  const valid = DOMAIN_PATTERN.test(query);
  const { data, isLoading } = useSWR<DomainCheck>(
    valid ? `/api/domains?check=${encodeURIComponent(query)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (!valid) return null;

  const [tone, Icon, text] =
    !data || isLoading
      ? (['quiet', LoaderIcon, `Checking ${query}…`] as const)
      : data.points === 'here'
        ? (['good', CircleCheckIcon, `${query} points at this server`] as const)
        : data.points === 'nowhere'
          ? ([
              'bad',
              CircleAlertIcon,
              `${query} has no DNS record yet: point an A record at ${data.server.join(' or ')}`,
            ] as const)
          : ([
              'bad',
              CircleAlertIcon,
              `${query} points at ${data.addresses.join(', ')}, not this server (${data.server.join(' or ')})`,
            ] as const);
  return (
    <p
      aria-live='polite'
      className={cn(
        'flex items-start gap-1.5',
        tone === 'good' && 'text-success',
        tone === 'bad' && 'text-warning',
        tone === 'quiet' && 'text-muted-foreground'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          tone === 'quiet' && 'animate-spin'
        )}
      />
      {text}
    </p>
  );
}
