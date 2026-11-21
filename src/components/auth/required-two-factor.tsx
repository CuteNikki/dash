'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { useSignOut } from '@/components/settings/sign-in-again';
import { TwoFactor } from '@/components/settings/two-factor';
import { Button } from '@/components/ui/button';

/** Setting up an authenticator app, then on into the dashboard; or signing out instead. */
export function RequiredTwoFactor() {
  const t = useTranslations('auth');
  const router = useRouter();
  const signOut = useSignOut();
  const { data: session } = authClient.useSession();
  const on = !!session?.user.twoFactorEnabled;
  return (
    <div className='flex flex-col gap-4'>
      <TwoFactor />
      <div className='flex flex-wrap gap-2'>
        {on && (
          <Button
            onClick={() => {
              router.replace('/');
              router.refresh();
            }}
          >
            {t('continue')}
          </Button>
        )}
        <Button variant='outline' onClick={signOut}>
          <LogOutIcon />
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
