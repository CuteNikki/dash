'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { useAuthError } from '@/i18n/use-auth-error';

import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

/**
 * Asks for a link to reset a forgotten password. It says the same whether
 * or not there's an account with that address, so it can't be used to find
 * out who has one.
 */
export function ForgotForm() {
  const authError = useAuthError();
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className='flex flex-col gap-4'>
        <p>{t('forgotSent')}</p>
        <Button variant='outline' asChild>
          <Link href='/login'>{t('backToSignIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get('email'));
        startTransition(async () => {
          const { error } = await authClient
            .requestPasswordReset({ email, redirectTo: '/reset-password' })
            .catch(() => ({ error: { message: t('noAnswer') } }));
          if (error) {
            setError(authError(error, t('linkFailed')));
            return;
          }
          setSent(true);
        });
      }}
    >
      <FormField
        id='email'
        label={t('email')}
        type='email'
        autoComplete='email'
      />
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        {t('sendLink')}
      </Button>
      <Button variant='ghost' asChild>
        <Link href='/login'>{t('backToSignIn')}</Link>
      </Button>
    </form>
  );
}

/** Picks a new password, from a reset link's token; it signs out everywhere else. */
export function ResetForm({ token }: { token?: string }) {
  const authError = useAuthError();
  const t = useTranslations('auth');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!token) {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-destructive'>{t('linkUsed')}</p>
        <Button asChild>
          <Link href='/forgot-password'>{t('askNewLink')}</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className='flex flex-col gap-4'>
        <p>{t('passwordChanged')}</p>
        <Button asChild>
          <Link href='/login'>{t('signIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className='flex flex-col gap-4'
      // Sent from here rather than as the form's action, which would empty
      // both fields after, when only they might not match
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const password = String(form.get('password'));
        if (password !== String(form.get('repeat'))) {
          setError(t('passwordsDiffer'));
          return;
        }
        startTransition(async () => {
          const { error } = await authClient
            .resetPassword({ newPassword: password, token })
            .catch(() => ({ error: { message: t('noAnswer') } }));
          if (error) {
            setError(authError(error, t('changeFailed')));
            return;
          }
          setDone(true);
        });
      }}
    >
      <FormField
        id='password'
        label={t('newPassword')}
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
        {t('changePassword')}
      </Button>
    </form>
  );
}
