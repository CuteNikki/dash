import 'server-only';

import { db } from '@/lib/db';
import { LIVE_WINDOW_MS } from '@/lib/recent';
import type { HostStats, UsageHistory } from '@/lib/types';

// The monitor's minutes over a live graph's last ten, oldest first, which
// stand in for live readings the dashboard doesn't have: after it restarted,
// a service's container was recreated, or nobody watched for a while.

/** Where a live graph starts. */
const since = () => new Date(Date.now() - LIVE_WINDOW_MS);

/** The server's, as its live history has them; each core's isn't recorded. */
export async function recordedHost(): Promise<HostStats['history']> {
  const rows = await db.hostSample.findMany({
    where: { at: { gte: since() } },
    orderBy: { at: 'asc' },
    select: {
      at: true,
      cpu: true,
      memory: true,
      received: true,
      sent: true,
      diskRead: true,
      diskWritten: true,
    },
  });
  return {
    at: rows.map((r) => r.at.getTime()),
    cpu: rows.map((r) => r.cpu),
    coreCpu: [],
    memory: rows.map((r) => r.memory),
    received: rows.map((r) => r.received),
    sent: rows.map((r) => r.sent),
    diskRead: rows.map((r) => r.diskRead),
    diskWritten: rows.map((r) => r.diskWritten),
  };
}

/** Each of these services', by its tile key; one with none recorded isn't there. */
export async function recordedServices(keys: string[]) {
  const found = new Map<string, UsageHistory>();
  if (!keys.length) return found;
  const rows = await db.containerSample.findMany({
    where: { key: { in: keys }, at: { gte: since() } },
    orderBy: { at: 'asc' },
  });
  for (const r of rows) {
    let history = found.get(r.key);
    if (!history) found.set(r.key, (history = { at: [], cpu: [], memory: [] }));
    history.at.push(r.at.getTime());
    history.cpu.push(r.cpu);
    history.memory.push(r.memory);
  }
  return found;
}

/** A website tile's checks, by its tile key, as how long each took. */
export async function recordedSite(key: string) {
  const rows = await db.siteCheckLog.findMany({
    where: { key, at: { gte: since() } },
    orderBy: { at: 'asc' },
    select: { at: true, ms: true },
  });
  return { at: rows.map((r) => r.at.getTime()), ms: rows.map((r) => r.ms) };
}
