import { cookies } from 'next/headers';

import { COLUMNS_COOKIE, columnsFromCookie } from '@/lib/layout';
import { getDashboard } from '@/lib/services';
import { requireUser } from '@/lib/session';

import { Dashboard } from '@/components/dashboard';

/** Columns for a first visit, before the browser's said how wide it is: a laptop's. */
const FIRST_COLUMNS = 4;

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function Home() {
  const user = await requireUser();
  // As many columns as the screen had last time, so tiles start where they'll stay
  const columns =
    columnsFromCookie((await cookies()).get(COLUMNS_COOKIE)?.value) ??
    FIRST_COLUMNS;
  return (
    <Dashboard
      initial={await getDashboard()}
      initialColumns={columns}
      email={user.email}
    />
  );
}
