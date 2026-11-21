'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createAccount } from '@/actions/setup';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

export function SetupForm() {
  const t = useTranslations('auth');
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
            error: t('noAnswer'),
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
        label={t('setupCode')}
        // Letters and digits, as the log prints it, not a phone's keypad
        autoComplete='one-time-code'
        autoCapitalize='characters'
        spellCheck={false}
        className='font-mono'
      />
      <FormField id='name' label={t('name')} autoComplete='name' />
      <FormField
        id='email'
        label={t('email')}
        type='email'
        autoComplete='email'
      />
      <FormField
        id='password'
        label={t('password')}
        type='password'
        autoComplete='new-password'
      />
      {error && <p className='text-destructive'>{error}</p>}
      <Button type='submit' disabled={pending}>
        {t('createAccount')}
      </Button>
    </form>
  );
}
