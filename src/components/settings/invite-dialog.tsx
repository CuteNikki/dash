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
import { Switch } from '@/components/ui/switch';

/**
 * Invites someone by email, with the role and groups their account will
 * have: mails them the link, once there's mail, and shows it, this once,
 * to send them however suits otherwise.
 */
export function InviteDialog({
  open,
  allGroups,
  mail,
  onOpenChangeAction,
  onCreatedAction,
}: {
  open: boolean;
  allGroups: string[];
  /** The dashboard can send mail */
  mail: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onCreatedAction: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        {/* Mounted while open, so the next invite starts empty */}
        {open && (
          <InviteForm
            allGroups={allGroups}
            mail={mail}
            onCreatedAction={onCreatedAction}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  allGroups,
  mail,
  onCreatedAction,
}: {
  allGroups: string[];
  mail: boolean;
  onCreatedAction: () => void;
}) {
  const [send, setSend] = useState(mail);
  const [sent, setSent] = useState<{ ok: boolean; error?: string }>();
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
          send: mail && send,
        });
        if ('error' in result) {
          setError(result.error);
          return;
        }
        setLink(result.link);
        if (mail && send) setSent({ ok: result.sent, error: result.sendError });
        onCreatedAction();
      })
    );
  }

  if (link) {
    return (
      <div className='flex flex-col gap-6'>
        <DialogHeader>
          <DialogTitle>
            {sent?.ok ? `Sent to ${email}` : 'Send them this link'}
          </DialogTitle>
          <DialogDescription>
            {sent?.ok
              ? "It's in their mail, and here too, should it not arrive."
              : `It makes ${email}'s account.`}{' '}
            It works once, for 24 hours, and won&apos;t be shown again: only a
            hash of it is kept.
          </DialogDescription>
        </DialogHeader>
        {sent && !sent.ok && (
          <p className='text-destructive'>
            Couldn&apos;t mail it{sent.error ? `: ${sent.error}` : ''}. Send
            them the link yourself.
          </p>
        )}
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
        {mail && (
          <div className='flex items-center gap-2'>
            <Switch id='invite-send' checked={send} onCheckedChange={setSend} />
            <Label htmlFor='invite-send'>Mail them the link</Label>
          </div>
        )}
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      <DialogFooter>
        <Button type='submit' disabled={pending}>
          {mail && send ? 'Send the invite' : 'Make the link'}
        </Button>
      </DialogFooter>
    </form>
  );
}
