'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { KeyRoundIcon } from 'lucide-react';

import { acceptInvite } from '@/actions/invites';

import { useAuthError } from '@/i18n/use-auth-error';

import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';
import { type Role } from '@/lib/auth/roles';
import { SERVER_NAME } from '@/lib/site';

import { AuthCard } from '@/components/auth/auth-card';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

/**
 * Making an account from an invite, then offering a passkey for it. Its
 * cards are drawn here rather than by the page, as making the account sets
 * the session's cookie, which renders the page again with the invite used:
 * kept as the one thing the page shows, this stays mounted through that,
 * on the passkey's step, rather than becoming the page's "used" card.
 */
export function InviteForm({
  token,
  invite,
}: {
  token: string;
  /** Who it's for and as what; undefined once it's used or has run out */
  invite?: { email: string; role: Role };
}) {
  const authError = useAuthError();
  const tr = useTranslations('roles');
  const t = useTranslations('auth');
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function goIn() {
    router.replace('/');
    router.refresh();
  }

  if (joined) {
    return (
      <AuthCard title={t('passkeyTitle')} description={t('passkeyDescription')}>
        <div className='flex flex-col gap-4'>
          {error && <p className='text-destructive'>{error}</p>}
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await authClient.passkey
                  .addPasskey()
                  .catch(() => ({
                    error: {
                      message: t('noAnswer'),
                    },
                  }));
                if (result?.error) {
                  setError(authError(result.error, t('passkeyFailed')));
                  return;
                }
                toast.success(t('passkeyAdded'));
                goIn();
              })
            }
          >
            <KeyRoundIcon />
            {t('addPasskey')}
          </Button>
          <Button variant='outline' disabled={pending} onClick={goIn}>
            {t('skip')}
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (!invite) {
    return (
      <AuthCard
        title={t('inviteUsed')}
        description={t('inviteUsedDescription')}
      >
        <Button asChild className='w-full'>
          <Link href='/login'>{t('signIn')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={
        SERVER_NAME ? t('join', { server: SERVER_NAME }) : t('joinDashboard')
      }
      description={t('joinDescription', {
        email: invite.email,
        role: invite.role,
        abilities: tr(`${invite.role}.abilities`),
      })}
    >
      <form
        className='flex flex-col gap-4'
        // Sent from here rather than as the form's action, which would empty
        // every field after, when only the passwords might not match
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const field = (name: string) => String(form.get(name) ?? '');
          if (field('password') !== field('repeat')) {
            setError(t('passwordsDiffer'));
            return;
          }
          startTransition(async () => {
            const result = await acceptInvite({
              token,
              name: field('name'),
              password: field('password'),
            }).catch(() => ({
              error: t('noAnswer'),
            }));
            if (result?.error) {
              setError(result.error);
              return;
            }
            setError(undefined);
            setJoined(true);
          });
        }}
      >
        <FormField
          id='email'
          label={t('email')}
          type='email'
          // The invite's, which the account is made with
          value={invite.email}
          readOnly
          autoComplete='username'
          className='text-muted-foreground'
        />
        <FormField id='name' label={t('name')} autoComplete='name' />
        <FormField
          id='password'
          label={t('password')}
          type='password'
          autoComplete='new-password'
          minLength={MIN_PASSWORD}
          placeholder={t('passwordHint', { count: MIN_PASSWORD })}
        />
        <FormField
          id='repeat'
          label={t('repeatPassword')}
          type='password'
          autoComplete='new-password'
        />
        {error && <p className='text-destructive'>{error}</p>}
        <Button type='submit' disabled={pending}>
          {t('createAccount')}
        </Button>
      </form>
    </AuthCard>
  );
}
