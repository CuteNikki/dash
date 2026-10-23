import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth/auth-card';
import { ResetForm } from '@/components/auth/password-reset';

export const metadata: Metadata = { title: 'New password' };

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
  const { token, error } = await searchParams;
  return (
    <AuthCard title='Pick a new password' description='for your account'>
      <ResetForm
        token={!error && typeof token === 'string' ? token : undefined}
      />
    </AuthCard>
  );
}
