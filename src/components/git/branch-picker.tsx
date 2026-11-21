'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  CheckIcon,
  ChevronsUpDownIcon,
  GitBranchIcon,
  PlusIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * The branch a repository is on, to switch from: to one of its branches, one
 * only on a remote, or a new one by typing its name.
 */
export function BranchPicker({
  current,
  local,
  remote,
  disabled,
  onSwitchAction,
}: {
  current: string;
  local: string[];
  remote: string[];
  disabled?: boolean;
  onSwitchAction: (branch: string, create: boolean) => void;
}) {
  const t = useTranslations('git');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const isNew =
    typed !== '' &&
    !local.includes(typed) &&
    !remote.some((r) => r === typed || r.endsWith(`/${typed}`));

  function pick(branch: string, create: boolean) {
    setOpen(false);
    setQuery('');
    if (branch !== current) onSwitchAction(branch, create);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          aria-label={t('branch')}
          disabled={disabled}
          className='font-mono'
        >
          <GitBranchIcon />
          {current}
          <ChevronsUpDownIcon className='text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='p-0'>
        <Command>
          <CommandInput
            placeholder={t('findBranch')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup heading={t('branches')}>
              {local.map((branch) => (
                <CommandItem
                  key={branch}
                  value={branch}
                  onSelect={() => pick(branch, false)}
                  className='font-mono'
                >
                  <CheckIcon
                    className={cn(branch !== current && 'invisible')}
                  />
                  {branch}
                </CommandItem>
              ))}
            </CommandGroup>
            {remote.length > 0 && (
              <CommandGroup heading={t('onlyRemote')}>
                {remote.map((branch) => (
                  <CommandItem
                    key={branch}
                    value={branch}
                    onSelect={() => pick(branch, false)}
                    className='font-mono'
                  >
                    <CheckIcon className='invisible' />
                    {branch}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {isNew && (
              <CommandGroup heading={t('newBranch')}>
                <CommandItem
                  value={`create ${typed}`}
                  onSelect={() => pick(typed, true)}
                >
                  <PlusIcon />
                  {t.rich('createBranch', {
                    name: typed,
                    code: (chunks) => (
                      <span className='font-mono'>{chunks}</span>
                    ),
                  })}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
