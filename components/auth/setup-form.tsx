'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createAccount } from '@/actions/setup';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className='flex flex-col gap-4'
      // Sent from here rather than as the form's action, which would empty
      // every field after, when only the code might be wrong
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const field = (name: string) => String(form.get(name) ?? '');
        startTransition(async () => {
          const result = await createAccount({
            code: field('code'),
            name: field('name'),
            email: field('email'),
            password: field('password'),
          }).catch(() => ({
            error: "dash didn't answer; try again in a moment",
          }));
          if (result?.error) {
            setError(result.error);
            return;
          }
          router.replace('/');
          router.refresh();
        });
      }}
    >
      <FormField
        id='code'
        label='Setup code'
        // Letters and digits, as the log prints it, not a phone's keypad
        autoComplete='one-time-code'
        autoCapitalize='characters'
        spellCheck={false}
        className='font-mono'
      />
      <FormField id='name' label='Name' autoComplete='name' />
      <FormField id='email' label='Email' type='email' autoComplete='email' />
      <FormField
        id='password'
        label='Password'
        type='password'
        autoComplete='new-password'
      />
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        Create account
      </Button>
    </form>
  );
}
