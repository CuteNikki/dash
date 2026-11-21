import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getUser, hasAccount } from '@/lib/auth/session';
import { mailReady } from '@/lib/mail/mail';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('signInTitle') };
}

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function LoginPage() {
  const t = await getTranslations('auth');
  if (!(await hasAccount())) redirect('/setup');
  if (await getUser()) redirect('/');
  return (
    <AuthCard title={t('signIn')} description={t('signInDescription')}>
      <LoginForm canReset={mailReady()} />
    </AuthCard>
  );
}
