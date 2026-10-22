'use client';

import { toast } from 'sonner';

import { CopyIcon } from 'lucide-react';

import { splitAddress } from '@/lib/format';
import { hostOf, portName } from '@/lib/ports';
import { SERVER_NAME } from '@/lib/site';
import type { Service } from '@/lib/types';

import { Button } from '@/components/ui/button';

/**
 * The host its ports are reached on: its own address's, as mc.niso.moe, or
 * the server's when it has none that names one.
 */
function hostFor(service: Service) {
  for (const entry of service.addresses) {
    const host = hostOf(splitAddress(entry).address);
    if (host) return host;
  }
  return SERVER_NAME;
}

/**
 * The ports a service publishes, from Docker: each with its protocols and,
 * for a well-known one, what it's for; each to copy as host:port.
 */
export function PortList({ service }: { service: Service }) {
  const host = hostFor(service);

  async function copy(port: number) {
    const address = `${host}:${port}`;
    try {
      await navigator.clipboard.writeText(address);
      toast.success(`Copied ${address}`);
    } catch {
      toast.error("Couldn't copy; select it instead");
    }
  }

  return (
    <ul className='flex flex-col'>
      {service.ports!.map(({ port, protocols }) => (
        <li key={port} className='flex items-center gap-3'>
          <span className='w-14 shrink-0 font-mono font-medium tabular-nums'>
            {port}
          </span>
          <span className='w-20 shrink-0 font-mono text-muted-foreground'>
            {protocols.join(', ')}
          </span>
          <span className='min-w-0 truncate text-muted-foreground'>
            {portName(port)}
          </span>
          <Button
            variant='ghost'
            size='icon-xs'
            aria-label={`Copy ${host}:${port}`}
            title={`Copy ${host}:${port}`}
            onClick={() => copy(port)}
          >
            <CopyIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}
