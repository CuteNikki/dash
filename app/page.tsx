import { connection } from 'next/server';

import { getServices } from '@/lib/services';
import { requireUser } from '@/lib/session';

import { Dashboard } from '@/components/dashboard';

export default async function Home() {
  // Live from Docker on every visit, never built ahead of time
  await connection();
  const user = await requireUser();
  return <Dashboard initial={await getServices()} email={user.email} />;
}
