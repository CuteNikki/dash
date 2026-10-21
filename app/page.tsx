import { getDashboard } from '@/lib/services';
import { requireUser } from '@/lib/session';

import { Dashboard } from '@/components/dashboard';

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function Home() {
  const user = await requireUser();
  return <Dashboard initial={await getDashboard()} email={user.email} />;
}
