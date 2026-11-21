'use client';

import { useTranslations } from 'next-intl';

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
  const t = useTranslations('service');
  // The address alone, without what it's for
  function copy(entry: string) {
    const { address } = splitAddress(entry);
    return copyText(address, t('copied', { text: formatAddress(address) }));
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
                variant='outline'
                size='icon-sm'
                aria-label={t('copyThis', { text: address })}
                onClick={() => copy(address)}
              >
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('copy')}</TooltipContent>
          </Tooltip>
          {isLink(address) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='outline' size='icon-sm' asChild>
                  <a
                    href={splitAddress(address).address}
                    target='_blank'
                    rel='noreferrer'
                    aria-label={t('openThis', { text: address })}
                  >
                    <ExternalLinkIcon />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('open')}</TooltipContent>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  );
}
