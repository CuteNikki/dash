'use client';

import { CopyIcon, ExternalLinkIcon } from 'lucide-react';

import { formatAddress, isLink, splitAddress } from '@/lib/format';

import { copyText } from '@/components/common/toasts';
import { AddressText } from '@/components/service/address-text';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** A service's addresses, each to copy, and links to open as well. */
export function AddressList({ addresses }: { addresses: string[] }) {
  // The address alone, without what it's for
  function copy(entry: string) {
    const { address } = splitAddress(entry);
    return copyText(address, `Copied ${formatAddress(address)}`);
  }

  return (
    <ul className='flex flex-wrap gap-x-4 gap-y-1'>
      {addresses.map((address) => (
        <li key={address} className='flex min-w-0 items-center gap-1'>
          <span className='truncate font-mono'>
            <AddressText entry={address} />
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon-sm'
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
                <Button variant='ghost' size='icon-sm' asChild>
                  <a
                    href={splitAddress(address).address}
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
