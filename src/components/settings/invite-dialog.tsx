'use client';

import { useState, useTransition } from 'react';

import { CopyIcon } from 'lucide-react';

import { createInvite } from '@/actions/users';
import { seesAllGroups, type Role } from '@/lib/auth/roles';

import { attempt, copyText } from '@/components/common/toasts';
import { AccessFields } from '@/components/settings/people-access';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Invites someone by email, with the role and groups their account will
 * have; then shows the invite's link, this once, to send them however suits.
 * The dashboard sends no email itself.
 */
export function InviteDialog({
  open,
  allGroups,
  onOpenChangeAction,
  onCreatedAction,
}: {
  open: boolean;
  allGroups: string[];
  onOpenChangeAction: (open: boolean) => void;
  onCreatedAction: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        {/* Mounted while open, so the next invite starts empty */}
        {open && (
          <InviteForm allGroups={allGroups} onCreatedAction={onCreatedAction} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  allGroups,
  onCreatedAction,
}: {
  allGroups: string[];
  onCreatedAction: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [groups, setGroups] = useState<string[]>([]);
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(() =>
      attempt(`Couldn't invite ${email}`, async () => {
        // An owner or admin sees every group, so any ticked before don't count
        const result = await createInvite({
          email,
          role,
          groups: seesAllGroups(role) ? [] : groups,
        });
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setLink(result.link);
        onCreatedAction();
      })
    );
  }

  if (link) {
    return (
      <div className='flex flex-col gap-6'>
        <DialogHeader>
          <DialogTitle>Send them this link</DialogTitle>
          <DialogDescription>
            It makes {email}&apos;s account. It works once, for 24 hours, and
            won&apos;t be shown again: only a hash of it is kept.
          </DialogDescription>
        </DialogHeader>
        <div className='flex items-center gap-2'>
          <Input
            readOnly
            value={link}
            aria-label='Invite link'
            className='font-mono'
            // All of it at once, to copy by hand where the button can't
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant='outline'
            onClick={() => copyText(link, 'Copied the invite link')}
          >
            <CopyIcon />
            Copy
          </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      className='flex flex-col gap-6'
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <DialogHeader>
        <DialogTitle>Invite someone</DialogTitle>
        <DialogDescription>
          They get a link to make their account with, which works once, for 24
          hours.
        </DialogDescription>
      </DialogHeader>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='invite-email'>Email</Label>
          <Input
            id='invite-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete='off'
            required
          />
        </div>
        <AccessFields
          id='invite'
          role={role}
          groups={groups}
          allGroups={allGroups}
          onRoleChangeAction={setRole}
          onGroupsChangeAction={setGroups}
        />
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      <DialogFooter>
        <Button type='submit' disabled={pending}>
          Make the link
        </Button>
      </DialogFooter>
    </form>
  );
}
