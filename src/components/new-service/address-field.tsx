'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { CircleAlertIcon, CircleCheckIcon, LoaderIcon } from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import type { DomainCheck } from '@/lib/stacks/domains';
import { DOMAIN_PATTERN } from '@/lib/stacks/new-service';
import { cn } from '@/lib/utils';

import { useDebounced } from '@/components/common/use-debounced';
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
 * this server yet, checked once typing pauses.
 */
export function AddressField({
  id,
  onChangeAction,
  disabled,
}: {
  id: string;
  /** The whole domain, or '' for none */
  onChangeAction: (domain: string) => void;
  disabled?: boolean;
}) {
  const { data: domains } = useSWR<string[]>('/api/domains', fetcher, {
    revalidateOnFocus: false,
  });
  const [name, setName] = useState('');
  // The server's own domain, its first, until another's picked
  const [picked, setPicked] = useState<string>();
  const zone = picked ?? domains?.[0] ?? OTHER;
  const typed = name.trim().toLowerCase();
  const domain = !typed ? '' : zone === OTHER ? typed : `${typed}.${zone}`;
  // Told of the whole domain whenever it changes, typed or picked or when
  // the server's domains arrive after a name's typed, which changes the one
  // it's under without anything being touched
  useEffect(() => onChangeAction(domain), [domain, onChangeAction]);
  // Its DNS asked about once typing pauses, not for every key
  const query = useDebounced(domain);

  return (
    <div className='flex flex-col gap-2'>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={zone === OTHER ? 'app.example.com' : 'app'}
          className='font-mono'
          autoComplete='off'
          disabled={disabled}
        />
        {/* Its arrow as far from the edge as a select's own, the addon's
            padding being taken up by the select's */}
        <InputGroupAddon align='inline-end' className='pr-1'>
          <Select value={zone} onValueChange={setPicked} disabled={disabled}>
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
      {domain && query && <DnsStatus domain={query} />}
    </div>
  );
}

/** Whether a domain points at this server yet. */
function DnsStatus({ domain }: { domain: string }) {
  const valid = DOMAIN_PATTERN.test(domain);
  const { data, isLoading } = useSWR<DomainCheck>(
    valid ? `/api/domains?check=${encodeURIComponent(domain)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (!valid) return null;

  const [tone, Icon, text] =
    !data || isLoading
      ? (['quiet', LoaderIcon, `Checking ${domain}…`] as const)
      : data.points === 'here'
        ? ([
            'good',
            CircleCheckIcon,
            `${domain} points at this server`,
          ] as const)
        : data.points === 'nowhere'
          ? ([
              'bad',
              CircleAlertIcon,
              `${domain} has no DNS record yet: point an A record at ${data.server.join(' or ')}`,
            ] as const)
          : ([
              'bad',
              CircleAlertIcon,
              `${domain} points at ${data.addresses.join(', ')}, not this server (${data.server.join(' or ')})`,
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
