import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { requireAccess } from '@/lib/auth/access';
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

/** The tab says which server it's the dashboard of. */
export const metadata: Metadata = {
  title: {
    absolute: SERVER_NAME ? `Dashboard · ${SERVER_NAME}` : 'Dashboard',
  },
};

/** Columns for a first visit, before the browser's said how wide it is: a laptop's. */
const FIRST_COLUMNS = 4;

// Checks the account and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

export default async function Home() {
  const access = await requireAccess('view');
  // As many columns as the screen had last time, so tiles start where they'll stay
  const cookieStore = await cookies();
  const columns =
    columnsFromCookie(cookieStore.get(COLUMNS_COOKIE)?.value) ?? FIRST_COLUMNS;
  return (
    <Dashboard
      initial={await getDashboard(access)}
      initialColumns={columns}
      initialView={viewFromCookie(cookieStore.get(VIEW_COOKIE)?.value)}
      initialFilter={filterFromCookie(cookieStore.get(FILTER_COOKIE)?.value)}
      me={{
        name: access.user.name,
        email: access.user.email,
        role: access.role,
        groups: access.groups,
      }}
    />
  );
}
