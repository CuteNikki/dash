import 'server-only';

import { db } from '@/lib/db';
import type { AlertView } from '@/lib/types';

type Row = Awaited<ReturnType<typeof db.alert.findMany>>[number];

function view(a: Row): AlertView {
  return {
    id: a.id,
    kind: a.kind as AlertView['kind'],
    subject: a.subject,
    message: a.message,
    since: a.since.getTime(),
    resolvedAt: a.resolvedAt?.getTime(),
    mailed: a.notifiedAt !== null,
  };
}

/** What's wrong now, longest first. */
export async function openAlerts() {
  const rows = await db.alert.findMany({
    where: { resolvedAt: null },
    orderBy: { since: 'asc' },
  });
  return rows.map(view);
}

/** The most alerts over that are listed. */
const RECENT = 50;

/** What's wrong now, and what was wrong lately and is over, newest first, as of `at`. */
export async function recentAlerts() {
  const [open, over] = await Promise.all([
    openAlerts(),
    db.alert.findMany({
      where: { resolvedAt: { not: null } },
      orderBy: { since: 'desc' },
      take: RECENT,
    }),
  ]);
  return { open, over: over.map(view), at: Date.now() };
}
