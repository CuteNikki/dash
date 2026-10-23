'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { KeyRoundIcon } from 'lucide-react';

import { acceptInvite } from '@/actions/invites';
import { authClient } from '@/lib/auth/auth-client';
import { MIN_PASSWORD } from '@/lib/auth/password';
import { ROLE_INFO, type Role } from '@/lib/auth/roles';
import { SERVER_NAME } from '@/lib/site';

import { AuthCard } from '@/components/auth/auth-card';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';

/** "an Operator", "a Viewer" */
const withArticle = (word: string) =>
  `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

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
      <AuthCard
        title='Add a passkey too?'
        description='Then you can sign in with your fingerprint, face or security key, rather than typing your password.'
      >
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
                      message: "dash didn't answer; try again in a moment",
                    },
                  }));
                if (result?.error) {
                  setError(result.error.message ?? "Couldn't add the passkey");
                  return;
                }
                toast.success(
                  'Passkey added. You can sign in with it next time.'
                );
                goIn();
              })
            }
          >
            <KeyRoundIcon />
            Add a passkey
          </Button>
          <Button variant='ghost' disabled={pending} onClick={goIn}>
            Skip
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (!invite) {
    return (
      <AuthCard
        title='This invite has been used'
        description='Or it has run out: each works once, for 24 hours. Ask for a new one, or sign in if you already have an account.'
      >
        <Button asChild className='w-full'>
          <Link href='/login'>Sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  const info = ROLE_INFO[invite.role];
  return (
    <AuthCard
      title={`Join ${SERVER_NAME ?? 'the dashboard'}`}
      description={`Make the account for ${invite.email}, as ${withArticle(info.name.toLowerCase())}: ${info.description.toLowerCase()}.`}
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
            setError('The passwords don’t match');
            return;
          }
          startTransition(async () => {
            const result = await acceptInvite({
              token,
              name: field('name'),
              password: field('password'),
            }).catch(() => ({
              error: "dash didn't answer; try again in a moment",
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
          label='Email'
          type='email'
          // The invite's, which the account is made with
          value={invite.email}
          readOnly
          autoComplete='username'
          className='text-muted-foreground'
        />
        <FormField id='name' label='Name' autoComplete='name' />
        <FormField
          id='password'
          label='Password'
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
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
