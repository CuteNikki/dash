'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { KeyRoundIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type AuthResult = { error: { message?: string } | null } | undefined;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Signs in one way or another, saying why not where it couldn't. */
  function signIn(how: () => Promise<AuthResult>) {
    startTransition(async () => {
      const result = await how().catch(() => ({
        error: { message: "dash didn't answer; try again in a moment" },
      }));
      if (result?.error) {
        setError(result.error.message ?? "Couldn't sign in");
        return;
      }
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <div className='flex flex-col gap-4'>
      <form
        className='flex flex-col gap-4'
        // Sent from here rather than as the form's action, which would empty
        // the fields after, the email too when only the password was wrong
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          signIn(() =>
            authClient.signIn.email({
              email: String(form.get('email')),
              password: String(form.get('password')),
            })
          );
        }}
      >
        <FormField
          id='email'
          label='Email'
          type='email'
          autoComplete='username webauthn'
        />
        <FormField
          id='password'
          label='Password'
          type='password'
          autoComplete='current-password'
        />
        {error && <p className='text-destructive'>{error}</p>}
        <Button type='submit' disabled={pending}>
          Sign in
        </Button>
      </form>
      <Separator />
      <Button
        variant='outline'
        disabled={pending}
        onClick={() => signIn(() => authClient.signIn.passkey())}
      >
        <KeyRoundIcon />
        Sign in with a passkey
      </Button>
    </div>
  );
}
