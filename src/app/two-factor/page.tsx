import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getAccess } from '@/lib/auth/access';

import { AuthCard } from '@/components/auth/auth-card';
import { RequiredTwoFactor } from '@/components/auth/required-two-factor';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('twoFactorTitle') };
}

// Checks the session before anything shows, and may redirect, so the page
// waits for it rather than streaming a placeholder first
export const instant = false;

/**
 * Where someone whose role asks for two-factor is sent until they've set it
 * up: the one thing they can do until then, besides signing out.
 */
export default async function TwoFactorPage() {
  const access = await getAccess();
  if (!access) redirect('/login');
  if (!access.needsTwoFactor) redirect('/');
  const t = await getTranslations('auth');
  return (
    <AuthCard
      title={t('twoFactorTitle')}
      description={t('twoFactorDescription')}
    >
      <RequiredTwoFactor />
    </AuthCard>
  );
}
