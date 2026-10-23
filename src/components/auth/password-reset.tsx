'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

const NO_ANSWER = "The dashboard didn't answer; try again in a moment";

/**
 * Asks for a link to reset a forgotten password. It says the same whether
 * or not there's an account with that address, so it can't be used to find
 * out who has one.
 */
export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className='flex flex-col gap-4'>
        <p>
          If there's an account with that address, a link to pick a new password
          is on its way. It works for an hour.
        </p>
        <Button variant='outline' asChild>
          <Link href='/login'>Back to sign in</Link>
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
            .catch(() => ({ error: { message: NO_ANSWER } }));
          if (error) {
            setError(error.message ?? "Couldn't send the link");
            return;
          }
          setSent(true);
        });
      }}
    >
      <FormField id='email' label='Email' type='email' autoComplete='email' />
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        Send me a link
      </Button>
      <Button variant='ghost' asChild>
        <Link href='/login'>Back to sign in</Link>
      </Button>
    </form>
  );
}

/** Picks a new password, from a reset link's token; it signs out everywhere else. */
export function ResetForm({ token }: { token?: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!token) {
    return (
      <div className='flex flex-col gap-4'>
        <p className='text-destructive'>
          This link has been used, or has run out. Ask for another.
        </p>
        <Button asChild>
          <Link href='/forgot-password'>Ask for a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className='flex flex-col gap-4'>
        <p>Your password is changed, and you're signed out everywhere.</p>
        <Button asChild>
          <Link href='/login'>Sign in</Link>
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
          setError("The passwords don't match");
          return;
        }
        startTransition(async () => {
          const { error } = await authClient
            .resetPassword({ newPassword: password, token })
            .catch(() => ({ error: { message: NO_ANSWER } }));
          if (error) {
            setError(error.message ?? "Couldn't change the password");
            return;
          }
          setDone(true);
        });
      }}
    >
      <FormField
        id='password'
        label='New password'
        type='password'
        autoComplete='new-password'
        minLength={MIN_PASSWORD}
        placeholder={`${MIN_PASSWORD} characters or more`}
      />
      <FormField
        id='repeat'
        label='Password again'
        type='password'
        autoComplete='new-password'
      />
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        Change password
      </Button>
    </form>
  );
}
