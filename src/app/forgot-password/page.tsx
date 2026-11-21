import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { mailReady } from '@/lib/mail/mail';

import { AuthCard } from '@/components/auth/auth-card';
import { ForgotForm } from '@/components/auth/password-reset';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('forgotTitle') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  // Without mail there's no way to send the link
  if (!mailReady()) redirect('/login');
  return (
    <AuthCard title={t('forgot')} description={t('forgotDescription')}>
      <ForgotForm />
    </AuthCard>
  );
}
