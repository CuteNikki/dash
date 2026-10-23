import 'server-only';

import { KEEP_ACTIVITY_DAYS } from '@/lib/activity/read';
import { KEEP_ALERTS_DAYS, notify } from '@/lib/alerts/alerts';
import {
  checkCerts,
  checkDisk,
  checkServices,
  checkSites,
  type SiteResult,
} from '@/lib/alerts/checks';
import { inBackground } from '@/lib/background';
import { serviceKey, siteUrl } from '@/lib/dashboard/services';
import { probeSite } from '@/lib/dashboard/sites';
import { isRunning } from '@/lib/dashboard/status';
import { SITE_PREFIX } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';
import {
  containerCounters,
  listContainers,
  type Container,
  type UsageCounters,
} from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';
import { readHost, type HostReading } from '@/lib/host/host';

/** A reading a minute, of the server, its services and the websites. */
const INTERVAL_MS = 60_000;
/** How long the server's and services' readings are kept. */
export const KEEP_USAGE_DAYS = 7;
/** How long websites' checks are kept, for their uptime over a month. */
export const KEEP_CHECKS_DAYS = 30;
/** How often what's older than that is cleared out. */
const PRUNE_MS = 60 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

type Monitor = {
  timer?: NodeJS.Timeout;
  /** The copy of this module whose timer runs, as in usage.ts */
  owner?: symbol;
  /** A minute's still being read, so the next waits rather than piling up */
  busy: boolean;
  /** The last readings, to measure the minute since against */
  lastHost?: HostReading;
  lastContainers: Map<string, UsageCounters>;
  lastPrune: number;
};

// Kept on globalThis, as the usage sampler is, so a hot reload in
// development doesn't start a second timer; the one running is restarted
// with the new code, at the end of this file
const MODULE = Symbol('monitor');
const monitor: Monitor = ((
  globalThis as typeof globalThis & { monitor?: Monitor }
).monitor ??= { busy: false, lastContainers: new Map(), lastPrune: 0 });
const reloaded = monitor.owner !== MODULE && monitor.timer !== undefined;
if (reloaded) {
  clearInterval(monitor.timer);
  monitor.timer = undefined;
}

/**
 * Whether this copy of the dashboard keeps the record: the one on the server
 * does, and one in development doesn't unless MONITOR=on, as both write to
 * the same database.
 */
export function monitorEnabled() {
  const setting = process.env.MONITOR;
  if (setting) return setting === 'on';
  return process.env.NODE_ENV === 'production';
}

/** Starts reading a minute, from server start; once, however often it's called. */
export function startMonitor() {
  if (monitor.timer) return;
  monitor.owner = MODULE;
  monitor.timer = inBackground(() =>
    setInterval(() => void tick(), INTERVAL_MS)
  );
  void tick();
}

/** The minute a reading is for, so every one taken in it is filed together. */
const minuteOf = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000);

async function tick() {
  if (monitor.busy) return;
  monitor.busy = true;
  try {
    const at = minuteOf(Date.now());
    const containers = await listContainers().catch(() => undefined);
    const [host, , sites] = await Promise.all([
      recordHost(at),
      containers && recordContainers(at, containers),
      recordSites(at),
    ]);
    // Then what's wrong, from the same readings, each check on its own so
    // one failing doesn't keep the others from saying theirs
    const checks = await Promise.allSettled([
      containers && checkServices(containers),
      checkDisk(host.disk),
      checkSites(sites),
      containers && checkCerts(containers),
    ]);
    for (const check of checks) {
      if (check.status === 'rejected') console.error('Alerts:', check.reason);
    }
    await notify();
    if (Date.now() - monitor.lastPrune > PRUNE_MS) {
      monitor.lastPrune = Date.now();
      await prune();
    }
  } catch (error) {
    console.error('Monitor:', error);
  } finally {
    monitor.busy = false;
  }
}

/** The server over the minute since the last reading: its first only starts it. */
async function recordHost(at: Date) {
  const now = await readHost();
  const last = monitor.lastHost;
  monitor.lastHost = now;
  // A restart starts the kernel's counters again
  if (!last || now.uptime < last.uptime) return now;
  const seconds = (now.at - last.at) / 1000;
  const rate = (from: number, to: number) => Math.max(0, to - from) / seconds;
  const ticks = now.cpu.total - last.cpu.total;
  const ops = now.diskIo.ops - last.diskIo.ops;
  await db.hostSample.create({
    data: {
      at,
      cpu: ticks > 0 ? ((now.cpu.busy - last.cpu.busy) / ticks) * 100 : 0,
      memory: now.memory.used,
      diskUsed: now.disk.used,
      received: rate(last.network.received, now.network.received),
      sent: rate(last.network.sent, now.network.sent),
      diskRead: rate(last.diskIo.read, now.diskIo.read),
      diskWritten: rate(last.diskIo.written, now.diskIo.written),
      diskWait: ops > 0 ? (now.diskIo.waitMs - last.diskIo.waitMs) / ops : 0,
      load: now.load[0],
    },
    select: { at: true },
  });
  return now;
}

/**
 * Each running service over the minute since the last reading, by its tile
 * key. One just started has its first reading, to measure the next against.
 */
async function recordContainers(at: Date, containers: Container[]) {
  const running = containers.filter(
    (c) => isRunning(c.state) && !c.labels[RUN_LABEL]
  );
  const seen = new Map<string, UsageCounters>();
  const rows: { key: string; at: Date; cpu: number; memory: number }[] = [];
  await Promise.all(
    running.map(async (c) => {
      try {
        const now = await containerCounters(c.id);
        seen.set(c.id, now);
        const last = monitor.lastContainers.get(c.id);
        if (!last) return;
        const system = now.system - last.system;
        const used = Math.max(0, now.cpu - last.cpu);
        rows.push({
          key: serviceKey(c),
          at,
          cpu: system > 0 ? (used / system) * now.cores * 100 : 0,
          memory: now.memory,
        });
      } catch {
        // Stopped between listing and reading: it drops out next time
      }
    })
  );
  monitor.lastContainers = seen;
  // A service run as more than one container has its first's
  await db.containerSample.createMany({ data: rows, skipDuplicates: true });
}

/** Asks each website tile's page how it is, as the dashboard does. */
async function recordSites(at: Date): Promise<SiteResult[]> {
  const tiles = await db.tile.findMany({
    where: { key: { startsWith: SITE_PREFIX } },
    select: { key: true, name: true, addresses: true },
  });
  const results = await Promise.all(
    tiles.flatMap((t) => {
      const url = siteUrl(t.addresses);
      if (!url) return [];
      return probeSite(url.href).then((p) => ({
        key: t.key,
        name: t.name || url.host,
        ok: p.ok,
        ms: p.ms,
        status: p.status,
        error: p.error,
      }));
    })
  );
  await db.siteCheckLog.createMany({
    data: results.map((r) => ({
      key: r.key,
      at,
      ok: r.ok,
      ms: r.ms,
      status: r.status,
      error: r.error,
    })),
    skipDuplicates: true,
  });
  return results;
}

/** Clears out readings, the activity log and alerts long over, older than they're kept for. */
async function prune() {
  const now = Date.now();
  const usage = new Date(now - KEEP_USAGE_DAYS * DAY_MS);
  const checks = new Date(now - KEEP_CHECKS_DAYS * DAY_MS);
  const activity = new Date(now - KEEP_ACTIVITY_DAYS * DAY_MS);
  await db.$transaction([
    db.hostSample.deleteMany({ where: { at: { lt: usage } } }),
    db.containerSample.deleteMany({ where: { at: { lt: usage } } }),
    db.siteCheckLog.deleteMany({ where: { at: { lt: checks } } }),
    db.activity.deleteMany({ where: { at: { lt: activity } } }),
    db.alert.deleteMany({
      where: {
        resolvedAt: { lt: new Date(now - KEEP_ALERTS_DAYS * DAY_MS) },
      },
    }),
  ]);
}

if (reloaded) startMonitor();
