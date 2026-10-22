import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { requireUser } from '@/lib/auth/session';
import { COLUMNS_COOKIE, columnsFromCookie } from '@/lib/dashboard/layout';
import { getDashboard } from '@/lib/dashboard/services';
import {
  FILTER_COOKIE,
  filterFromCookie,
  VIEW_COOKIE,
  viewFromCookie,
} from '@/lib/dashboard/view';
import { SERVER_NAME } from '@/lib/site';

import { Dashboard } from '@/components/dashboard/dashboard';

/** The tab says which server it's the dashboard of, rather than dash's name. */
export const metadata: Metadata = {
  title: { absolute: `Dashboard · ${SERVER_NAME}` },
};

/** Columns for a first visit, before the browser's said how wide it is: a laptop's. */
const FIRST_COLUMNS = 4;

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function Home() {
  const user = await requireUser();
  // As many columns as the screen had last time, so tiles start where they'll stay
  const cookieStore = await cookies();
  const columns =
    columnsFromCookie(cookieStore.get(COLUMNS_COOKIE)?.value) ?? FIRST_COLUMNS;
  return (
    <Dashboard
      initial={await getDashboard()}
      initialColumns={columns}
      initialView={viewFromCookie(cookieStore.get(VIEW_COOKIE)?.value)}
      initialFilter={filterFromCookie(cookieStore.get(FILTER_COOKIE)?.value)}
      email={user.email}
    />
  );
}
