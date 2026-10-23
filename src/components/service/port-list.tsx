'use client';

import { CopyIcon } from 'lucide-react';

import { splitAddress } from '@/lib/format';
import { hostOf, portName } from '@/lib/ports';
import { SERVER_NAME } from '@/lib/site';
import type { Service } from '@/lib/types';

import { copyText } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';

/**
 * The host its ports are reached on: its own address's, as mc.example.com,
 * or the server's when it has none that names one, and lacking that, the
 * dashboard's own, which is on the same server.
 */
function hostFor(service: Service) {
  for (const entry of service.addresses) {
    const host = hostOf(splitAddress(entry).address);
    if (host) return host;
  }
  return SERVER_NAME ?? location.hostname;
}

/**
 * The ports a service publishes, from Docker: each with its protocols and,
 * for a well-known one, what it's for; each to copy as host:port.
 */
export function PortList({ service }: { service: Service }) {
  const host = hostFor(service);

  function copy(port: number) {
    const address = `${host}:${port}`;
    return copyText(address, `Copied ${address}`);
  }

  return (
    <ul className='flex flex-col gap-1'>
      {service.ports!.map(({ port, protocols }) => (
        <li key={port} className='flex items-center gap-2'>
          <span className='w-14 shrink-0 font-mono font-medium tabular-nums'>
            {port}
          </span>
          <span className='w-16 shrink-0 font-mono text-muted-foreground'>
            {protocols.join(', ')}
          </span>
          <span className='min-w-0 flex-1 truncate text-muted-foreground'>
            {portName(port)}
          </span>
          <Button
            variant='outline'
            size='icon-xs'
            aria-label={`Copy ${host}:${port}`}
            title={`Copy ${host}:${port}`}
            onClick={() => copy(port)}
          >
            {/* A size up from the button's own, to be made out at a glance */}
            <CopyIcon className='size-3' />
          </Button>
        </li>
      ))}
    </ul>
  );
}
