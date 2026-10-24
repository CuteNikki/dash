'use client';

import { can, ROLE_INFO } from '@/lib/auth/roles';
import type { Me } from '@/lib/types';

import { ScrollFade } from '@/components/common/scroll-fade';
import { AccountPanel } from '@/components/settings/account-panel';
import { ActivityPanel } from '@/components/settings/activity-panel';
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
 * and password; its passkeys, two-factor and sessions; for the owner,
 * everyone else's accounts; and for those who see the whole server, what's
 * been done from the dashboard.
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
      {/* Full screen on a phone; on a computer, a large window in the middle
          as tall as its tab, up to 5/6 of the screen, so a short one leaves
          no empty space under it. Its least height keeps a short tab from
          shrinking the window much when switched to */}
      <DialogContent
        className='flex h-full max-h-none max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-fit sm:max-h-5/6 sm:min-h-[min(32rem,83vh)] sm:max-w-5xl sm:rounded-xl'
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
            {can(me.role, 'server') && (
              <TabsTrigger value='activity'>Activity</TabsTrigger>
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
          {can(me.role, 'server') && (
            <Tab value='activity'>
              <ActivityPanel />
            </Tab>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** A tab's panel, scrolling within the window once it's taller than there's room for. */
function Tab({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContent value={value} className='flex min-h-0 flex-col'>
      <ScrollFade
        shrink
        className='min-h-0 overflow-x-hidden overflow-y-auto'
        fadeFrom='from-popover'
      >
        {children}
      </ScrollFade>
    </TabsContent>
  );
}
