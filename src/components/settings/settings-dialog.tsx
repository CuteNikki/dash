'use client';

import { ROLE_INFO } from '@/lib/auth/roles';
import type { Me } from '@/lib/types';

import { ScrollFade } from '@/components/common/scroll-fade';
import { AccountPanel } from '@/components/settings/account-panel';
import { PeoplePanel } from '@/components/settings/people-panel';
import { SecurityPanel } from '@/components/settings/security-panel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * The signed-in account's own settings, over the dashboard: its name, email
 * and password; its passkeys, two-factor and sessions; and for the owner,
 * everyone else's accounts.
 */
export function SettingsDialog({
  me,
  open,
  onOpenChangeAction,
}: {
  me: Me;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      {/* Full screen on a phone, a large window in the middle on a computer */}
      <DialogContent
        className='flex h-full max-h-none max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-5/6 sm:max-w-5xl sm:rounded-xl'
        // Focus the window itself, not its first field or button; Tab still
        // reaches each
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
        // Escape in a field that's being edited in place cancels the edit
        // instead, as a passkey's name does
        onEscapeKeyDown={(e) => {
          if ((e.target as Element).closest?.('[data-escape-cancels]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className='border-b p-4 pr-12'>
          <DialogTitle className='text-base'>Settings</DialogTitle>
          <DialogDescription className='truncate'>
            {me.name} · {ROLE_INFO[me.role].name}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue='account' className='min-h-0 flex-1 gap-4 p-4'>
          <TabsList>
            <TabsTrigger value='account'>Account</TabsTrigger>
            <TabsTrigger value='security'>Security</TabsTrigger>
            {me.role === 'owner' && (
              <TabsTrigger value='people'>People</TabsTrigger>
            )}
          </TabsList>
          <Tab value='account'>
            <AccountPanel me={me} />
          </Tab>
          <Tab value='security'>
            <SecurityPanel />
          </Tab>
          {me.role === 'owner' && (
            <Tab value='people'>
              <PeoplePanel />
            </Tab>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** A tab's panel, scrolling within the window, as the service window's do. */
function Tab({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContent value={value} className='min-h-0'>
      <ScrollFade
        fill
        className='h-full overflow-x-hidden overflow-y-auto'
        fadeFrom='from-popover'
      >
        {children}
      </ScrollFade>
    </TabsContent>
  );
}
