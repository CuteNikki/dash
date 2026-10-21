'use client';

import { toast } from 'sonner';

import { CopyIcon, ExternalLinkIcon } from 'lucide-react';

import { formatAddress, isLink } from '@/lib/format';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** A service's addresses, each to copy, and links to open as well. */
export function AddressList({ addresses }: { addresses: string[] }) {
  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      toast.success(`Copied ${formatAddress(address)}`);
    } catch {
      toast.error("Couldn't copy; select it instead");
    }
  }

  return (
    <ul className='flex flex-wrap gap-x-4 gap-y-1'>
      {addresses.map((address) => (
        <li
          key={address}
          className='flex min-w-0 items-center gap-1 leading-control'
        >
          <span className='truncate font-mono select-all'>
            {formatAddress(address)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`Copy ${address}`}
                onClick={() => copy(address)}
              >
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
          {isLink(address) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='ghost' size='icon-xs' asChild>
                  <a
                    href={address}
                    target='_blank'
                    rel='noreferrer'
                    aria-label={`Open ${address}`}
                  >
                    <ExternalLinkIcon />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open</TooltipContent>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  );
}
