import 'server-only';

import { db } from '@/lib/db';
import { bucketed } from '@/lib/monitor/history';
import type { HistoryRange } from '@/lib/monitor/ranges';
import type { SiteUptime } from '@/lib/types';

const DAY_MS = 24 * 60 * 60_000;

/** The most outages listed: enough to see a pattern, not a month of a site that's gone. */
const MAX_OUTAGES = 20;

/** A check a minute, so an outage lasts until the minute after its last failed one. */
const CHECK_MS = 60_000;

/** A website's uptime from the monitor's checks, with its response time over a range. */
export async function siteUptime(
  key: string,
  range: HistoryRange
): Promise<SiteUptime> {
  const now = Date.now();
  const since = (days: number) => new Date(now - days * DAY_MS);
  const [counts] = await db.$queryRaw<
    {
      up1: number;
      all1: number;
      up7: number;
      all7: number;
      up30: number;
      all30: number;
    }[]
  >`select
      count(*) filter (where ok and at >= ${since(1)})::int as up1,
      count(*) filter (where at >= ${since(1)})::int as all1,
      count(*) filter (where ok and at >= ${since(7)})::int as up7,
      count(*) filter (where at >= ${since(7)})::int as all7,
      count(*) filter (where ok)::int as up30,
      count(*)::int as all30
    from "SiteCheckLog" where key = ${key} and at >= ${since(30)}`;
  // Each run of failed checks: numbered by how many answered before it
  const runs = await db.$queryRaw<
    { start: Date; end: Date; reason: string | null; latest: boolean }[]
  >`select min(at) as start, max(at) as end,
      (array_agg(coalesce(error, 'HTTP ' || status) order by at))[1] as reason,
      bool_or(latest) as latest
    from (
      select at, ok, error, status,
        count(*) filter (where ok) over (order by at) as answered,
        at = max(at) over () as latest
      from "SiteCheckLog" where key = ${key} and at >= ${since(30)}
    ) checks
    where not ok
    group by answered
    order by start desc
    limit ${MAX_OUTAGES}`;
  const share = (up: number, all: number) => (all ? up / all : null);
  return {
    shares: [
      { range: '24h', up: share(counts.up1, counts.all1), checks: counts.all1 },
      { range: '7d', up: share(counts.up7, counts.all7), checks: counts.all7 },
      {
        range: '30d',
        up: share(counts.up30, counts.all30),
        checks: counts.all30,
      },
    ],
    outages: runs.map((r) => ({
      from: r.start.getTime(),
      to: r.latest ? undefined : r.end.getTime() + CHECK_MS,
      reason: r.reason ?? 'No answer',
    })),
    history: await bucketed(
      'SiteCheckLog',
      { ms: 'avg(ms) filter (where ok)', up: 'avg(ok::int)' },
      range,
      key
    ),
  };
}
