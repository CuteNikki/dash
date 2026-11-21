import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthCard } from '@/components/auth/auth-card';
import { ResetForm } from '@/components/auth/password-reset';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('resetTitle') };
}

// Reads the link's token from the address, so it waits for it rather than
// streaming a placeholder first
export const instant = false;

/**
 * Where a reset link lands, once Better Auth has checked its token: with
 * ?token= when it's good, ?error= when it's been used or has run out.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<'/reset-password'>) {
  const t = await getTranslations('auth');
  const { token, error } = await searchParams;
  return (
    <AuthCard title={t('reset')} description={t('resetDescription')}>
      <ResetForm
        token={!error && typeof token === 'string' ? token : undefined}
      />
    </AuthCard>
  );
}
