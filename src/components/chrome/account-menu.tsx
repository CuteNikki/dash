'use client';

import { useState } from 'react';

import { LogOutIcon, SettingsIcon, UserIcon } from 'lucide-react';

import { ROLE_INFO } from '@/lib/auth/roles';
import type { Me } from '@/lib/types';

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
          <Button variant='ghost' size='icon' aria-label='Account'>
            <UserIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-auto'>
          <DropdownMenuLabel className='flex flex-col font-normal'>
            <span className='font-medium'>{me.name}</span>
            <span className='text-muted-foreground'>
              {ROLE_INFO[me.role].name}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettings(true)}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
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
