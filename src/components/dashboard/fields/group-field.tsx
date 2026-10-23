'use client';

import { useState } from 'react';

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';

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

/** Picks one of the groups, or makes a new one by typing its name. */
export function GroupField({
  id,
  value,
  groups,
  onChangeAction,
  optional,
}: {
  id: string;
  value: string;
  groups: string[];
  onChangeAction: (group: string) => void;
  /** Can be left without a group, by None at the top of the list */
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const isNew =
    typed !== '' &&
    !groups.some((g) => g.toLowerCase() === typed.toLowerCase());

  function pick(group: string) {
    onChangeAction(group);
    setQuery('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className='w-full justify-between font-normal'
        >
          {/* Always something, so the arrow keeps to the end: with none
              picked, None, faintly */}
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || 'None'}
          </span>
          <ChevronsUpDownIcon className='text-muted-foreground' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-(--radix-popover-trigger-width) p-0'
      >
        <Command>
          <CommandInput
            placeholder='Find or add a group'
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup>
              {/* No group, wherever the dashboard then puts it */}
              {optional && (
                <CommandItem value='None' onSelect={() => pick('')}>
                  <CheckIcon className={cn(value && 'invisible')} />
                  None
                </CommandItem>
              )}
              {groups.map((group) => (
                <CommandItem
                  key={group}
                  value={group}
                  onSelect={() => pick(group)}
                >
                  <CheckIcon className={cn(group !== value && 'invisible')} />
                  {group}
                </CommandItem>
              ))}
              {isNew && (
                <CommandItem value={typed} onSelect={() => pick(typed)}>
                  <PlusIcon />
                  {typed}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
