'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { LogInIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { attempt } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';

/**
 * Better Auth's answer when what's asked needs a sign-in from the last day,
 * as listing sessions and adding a passkey do, so a session left open on
 * someone else's computer can't be used to add a way in of its own.
 */
export const isStale = (error: { code?: string } | null | undefined) =>
  error?.code === 'SESSION_NOT_FRESH';

/** Signs out, and goes to the sign-in page. */
export function useSignOut() {
  const t = useTranslations('security');
  const router = useRouter();
  return () =>
    attempt(t('signOutFailed'), async () => {
      await authClient.signOut();
      router.replace('/login');
      router.refresh();
    });
}

/** Said in place of what needs a recent sign-in, with the way to one. */
export function SignInAgain() {
  const t = useTranslations('security');
  const signOut = useSignOut();
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <p className='text-muted-foreground'>{t('signInAgainWhy')}</p>
      <Button variant='outline' size='sm' onClick={signOut}>
        <LogInIcon />
        {t('signInAgain')}
      </Button>
    </div>
  );
}
