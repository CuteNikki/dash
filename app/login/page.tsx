import { redirect } from 'next/navigation';

import { getUser, hasAccount } from '@/lib/session';

import { AuthCard } from '@/components/auth-card';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
  if (!(await hasAccount())) redirect('/setup');
  if (await getUser()) redirect('/');
  return (
    <AuthCard
      title='Sign in'
      description='to manage the services on this server'
    >
      <LoginForm />
    </AuthCard>
  );
}
