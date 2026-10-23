'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { KeyRoundIcon, LogOutIcon, UserIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';
import type { Me } from '@/lib/types';

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
  const router = useRouter();

  async function addPasskey() {
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      toast.error("Couldn't add the passkey", {
        description: result.error.message,
      });
    } else {
      toast.success('Passkey added. You can sign in with it next time.');
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='Account'>
          <UserIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-auto'>
        <DropdownMenuLabel className='font-normal text-muted-foreground'>
          {me.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={addPasskey}>
          <KeyRoundIcon />
          Add a passkey
        </DropdownMenuItem>
        <DropdownMenuItem variant='destructive' onSelect={signOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
