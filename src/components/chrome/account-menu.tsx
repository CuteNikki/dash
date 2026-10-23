'use client';

import { useState } from 'react';

import { LogOutIcon, SettingsIcon } from 'lucide-react';

import { ROLE_INFO } from '@/lib/auth/roles';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ThemeItems } from '@/components/chrome/theme-button';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { useSignOut } from '@/components/settings/sign-in-again';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AccountMenu({ me }: { me: Me }) {
  const signOut = useSignOut();
  // Beside the menu rather than in it, so it stays open once the menu closes
  const [settings, setSettings] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='outline'
            size='icon'
            aria-label={`Account: ${me.name}`}
            className='rounded-full'
          >
            <Initial name={me.name} className='size-6' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuLabel className='flex items-center gap-2.5 py-2 text-foreground'>
            <Initial name={me.name} className='size-8 text-sm' />
            <span className='flex min-w-0 flex-col'>
              <span className='truncate text-sm font-medium'>{me.name}</span>
              <span className='text-muted-foreground'>
                {ROLE_INFO[me.role].name}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettings(true)}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          {/* On a phone the theme's here, as the header has no room for its button */}
          <div className='sm:hidden'>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <ThemeItems />
            <DropdownMenuSeparator />
          </div>
          <DropdownMenuItem variant='destructive' onSelect={signOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog
        me={me}
        open={settings}
        onOpenChangeAction={setSettings}
      />
    </>
  );
}

/** Someone's first letter in a circle, standing for them where a picture would. */
function Initial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-medium text-foreground uppercase',
        className
      )}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  );
}
