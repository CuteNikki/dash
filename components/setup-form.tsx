'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createAccount } from '@/actions/setup';

import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className='flex flex-col gap-4'
      action={(form) =>
        startTransition(async () => {
          const field = (name: string) => String(form.get(name) ?? '');
          const result = await createAccount({
            code: field('code'),
            name: field('name'),
            email: field('email'),
            password: field('password'),
          });
          if (result?.error) {
            setError(result.error);
            return;
          }
          router.replace('/');
          router.refresh();
        })
      }
    >
      <FormField
        id='code'
        label='Setup code'
        inputMode='numeric'
        autoComplete='one-time-code'
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
