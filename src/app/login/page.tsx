import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getUser, hasAccount } from '@/lib/auth/session';
import { mailReady } from '@/lib/mail/mail';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function LoginPage() {
  if (!(await hasAccount())) redirect('/setup');
  if (await getUser()) redirect('/');
  return (
    <AuthCard
      title='Sign in'
      description='to manage the services on this server'
    >
      <LoginForm canReset={mailReady()} />
    </AuthCard>
  );
}
