import { redirect } from 'next/navigation';

import { hasAccount } from '@/lib/session';
import { setupCode } from '@/lib/setup';

import { AuthCard } from '@/components/auth-card';
import { SetupForm } from '@/components/setup-form';

export default async function SetupPage() {
  if (await hasAccount()) redirect('/login');
  // Prints the code to the server log (once), for whoever runs the server
  setupCode();
  return (
    <AuthCard
      title='Set up dash'
      description="Make the account that manages this server. The setup code is in the dashboard's log (docker logs dash)."
    >
      <SetupForm />
    </AuthCard>
  );
}
