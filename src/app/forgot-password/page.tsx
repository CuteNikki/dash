import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { mailReady } from '@/lib/mail/mail';

import { AuthCard } from '@/components/auth/auth-card';
import { ForgotForm } from '@/components/auth/password-reset';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  // Without mail there's no way to send the link
  if (!mailReady()) redirect('/login');
  return (
    <AuthCard
      title='Forgot your password?'
      description='Get a link by mail to pick a new one'
    >
      <ForgotForm />
    </AuthCard>
  );
}
