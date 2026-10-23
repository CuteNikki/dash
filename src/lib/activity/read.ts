import 'server-only';

import type { ActivityEntry } from '@/lib/activity/actions';
import { db } from '@/lib/db';

/** Entries a page, newest first. */
export const ACTIVITY_PAGE = 50;

/** How long the log is kept. */
export const KEEP_ACTIVITY_DAYS = 90;

/**
 * A page of the log, newest first, from before a moment if given, and only
 * entries whose person, target or detail has `search` in it, if given.
 */
export async function readActivity({
  before,
  search,
}: {
  before?: number;
  search?: string;
}): Promise<{ entries: ActivityEntry[]; more: boolean }> {
  const text = search?.trim();
  const rows = await db.activity.findMany({
    where: {
      ...(before ? { at: { lt: new Date(before) } } : {}),
      ...(text
        ? {
            OR: (['user', 'target', 'detail', 'action'] as const).map(
              (field) => ({ [field]: { contains: text, mode: 'insensitive' } })
            ),
          }
        : {}),
    },
    orderBy: { at: 'desc' },
    take: ACTIVITY_PAGE + 1,
  });
  return {
    entries: rows.slice(0, ACTIVITY_PAGE).map((r) => ({
      id: r.id,
      at: r.at.getTime(),
      user: r.user,
      action: r.action,
      target: r.target ?? undefined,
      detail: r.detail ?? undefined,
      ok: r.ok,
      error: r.error ?? undefined,
    })),
    more: rows.length > ACTIVITY_PAGE,
  };
}
