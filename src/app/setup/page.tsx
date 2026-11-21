import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { hasAccount } from '@/lib/auth/session';
import { setupCode } from '@/lib/auth/setup';

import { AuthCard } from '@/components/auth/auth-card';
import { SetupForm } from '@/components/auth/setup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('setupTitle') };
}

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function SetupPage() {
  const t = await getTranslations('auth');
  if (await hasAccount()) redirect('/login');
  // Prints the code to the server log (once), for whoever runs the server
  setupCode();
  return (
    <AuthCard title={t('setup')} description={t('setupDescription')}>
      <SetupForm />
    </AuthCard>
  );
}
