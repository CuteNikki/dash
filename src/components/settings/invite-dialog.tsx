'use client';

import { useTranslations } from 'next-intl';
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
import { Textarea } from '@/components/ui/textarea';

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

/** The longest note an invite's mail carries, as the server keeps it to. */
const MAX_MESSAGE = 500;

function InviteForm({
  allGroups,
  mail,
  onCreatedAction,
}: {
  allGroups: string[];
  mail: boolean;
  onCreatedAction: () => void;
}) {
  const t = useTranslations('people');
  const [send, setSend] = useState(mail);
  const [sent, setSent] = useState<{ ok: boolean; error?: string }>();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [groups, setGroups] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(() =>
      attempt(t('inviteFailed', { email }), async () => {
        // An owner or admin sees every group, so any ticked before don't count
        const result = await createInvite({
          email,
          role,
          groups: seesAllGroups(role) ? [] : groups,
          send: mail && send,
          message: mail && send ? message : undefined,
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
            {sent?.ok ? t('sentTo', { email }) : t('sendLink')}
          </DialogTitle>
          <DialogDescription>
            {sent?.ok ? t('inTheirMail') : t('makesAccount', { email })}{' '}
            {t('linkOnce')}
          </DialogDescription>
        </DialogHeader>
        {sent && !sent.ok && (
          <p className='text-destructive'>
            {sent.error
              ? t('mailFailedBecause', { error: sent.error })
              : t('mailFailed')}
          </p>
        )}
        <div className='flex items-center gap-2'>
          <Input
            readOnly
            value={link}
            aria-label={t('inviteLink')}
            className='font-mono'
            // All of it at once, to copy by hand where the button can't
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant='outline'
            onClick={() => copyText(link, t('linkCopied'))}
          >
            <CopyIcon />
            {t('copy')}
          </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t('done')}</Button>
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
        <DialogTitle>{t('invite')}</DialogTitle>
        <DialogDescription>{t('inviteDescription')}</DialogDescription>
      </DialogHeader>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='invite-email'>{t('email')}</Label>
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
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              <Switch
                id='invite-send'
                checked={send}
                onCheckedChange={setSend}
              />
              <Label htmlFor='invite-send'>{t('mailLink')}</Label>
            </div>
            {/* Off rather than gone while the link isn't mailed, so
                nothing moves as it's switched */}
            <Textarea
              id='invite-message'
              aria-label={t('message')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!send}
              maxLength={MAX_MESSAGE}
              placeholder={t('messagePlaceholder')}
            />
          </div>
        )}
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      <DialogFooter>
        <Button type='submit' disabled={pending}>
          {mail && send ? t('sendInvite') : t('makeLink')}
        </Button>
      </DialogFooter>
    </form>
  );
}
