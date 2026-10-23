import 'server-only';

import tls from 'node:tls';

import { reconcile, type Finding } from '@/lib/alerts/alerts';
import { serviceKey, siteUrl } from '@/lib/dashboard/services';
import { db } from '@/lib/db';
import type { Container } from '@/lib/docker/docker';
import { RUN_LABEL } from '@/lib/docker/runner';
import { isLink } from '@/lib/format';
import type { Capacity } from '@/lib/types';

/** A service unhealthy or restarting this long is wrong, not just starting. */
const BAD_MS = 3 * 60_000;
/** The disk's this full, and all right again below the second. */
const DISK_FULL = 0.9;
const DISK_OK = 0.85;
/** A website's wrong once it's failed this many checks in a row. */
const SITE_FAILS = 3;
/** A certificate's wrong this close to running out. */
const CERT_DAYS = 14;
/** How often certificates are looked at; they change slowly. */
const CERT_EVERY_MS = 6 * 60 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

/**
 * What the checks remember between rounds, on globalThis as the monitor's
 * readings are: each service's last state, and each site's failures.
 */
type Memory = {
  services: Map<
    string,
    { running: boolean; badSince?: number; downSince?: number }
  >;
  siteFails: Map<string, number>;
  certsAt: number;
};
const memory: Memory = ((
  globalThis as typeof globalThis & { alertMemory?: Memory }
).alertMemory ??= { services: new Map(), siteFails: new Map(), certsAt: 0 });

/** What the dashboard did to a service that explains it stopping. */
const STOPS = ['stop', 'restart', 'update', 'deploy', 'service.remove'];
/** What it did to the whole server that explains any stopping. */
const SERVER_STOPS = ['system.upgrade', 'system.reboot'];

/** "Exited (137) 2 minutes ago" → "137" */
const exitCode = (status: string) => status.match(/^Exited \((\d+)\)/)?.[1];

/**
 * Services: wrong when one that was running has stopped, unless it was
 * stopped from the dashboard, or the server was being upgraded or restarted;
 * or when it's been unhealthy or restarting a while. One already stopped
 * when the dashboard started isn't counted, as there's no telling it ran.
 */
export async function checkServices(containers: Container[]) {
  const now = Date.now();
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const c of containers) {
    if (c.labels[RUN_LABEL]) continue;
    const key = `service:${serviceKey(c)}`;
    seen.add(key);
    const before = memory.services.get(key);
    if (['running', 'starting', 'paused'].includes(c.state)) {
      memory.services.set(key, { running: true });
      continue;
    }
    if (c.state === 'unhealthy' || c.state === 'restarting') {
      const badSince = before?.badSince ?? now;
      memory.services.set(key, { running: true, badSince });
      if (now - badSince >= BAD_MS) {
        findings.push({
          key,
          kind: 'service',
          subject: c.name,
          message:
            c.state === 'unhealthy' ? 'Unhealthy' : 'Restarting over and over',
        });
      }
      continue;
    }
    // Stopped: only wrong if it was running, and not stopped on purpose
    if (!before?.running) {
      memory.services.set(key, { running: false });
      continue;
    }
    const downSince = before.downSince ?? now;
    const meant = await db.activity.findFirst({
      where: {
        ok: true,
        at: { gte: new Date(downSince - 10 * 60_000) },
        OR: [
          {
            action: { in: STOPS },
            target: { in: [c.name, c.stack?.project ?? c.name] },
          },
          { action: { in: SERVER_STOPS } },
        ],
      },
      select: { id: true },
    });
    if (meant) {
      memory.services.set(key, { running: false });
      continue;
    }
    memory.services.set(key, { running: true, downSince });
    const code = exitCode(c.status);
    findings.push({
      key,
      kind: 'service',
      subject: c.name,
      message:
        c.state === 'dead'
          ? 'Dead'
          : code
            ? `Stopped, exit code ${code}`
            : 'Stopped',
    });
  }
  for (const key of memory.services.keys()) {
    if (!seen.has(key)) memory.services.delete(key);
  }
  // Every service's alerts are this check's, a removed one's closing with it
  await reconcile((a) => a.kind === 'service', findings);
}

/** The disk: wrong once it's 90% full, until it's under 85% again. */
export async function checkDisk(disk: Capacity) {
  const share = disk.total > 0 ? disk.used / disk.total : 0;
  const open = await db.alert.findFirst({
    where: { key: 'disk', resolvedAt: null },
    select: { id: true },
  });
  const wrong = share >= DISK_FULL || (open !== null && share >= DISK_OK);
  const left = Math.round((disk.total - disk.used) / 1024 ** 3);
  await reconcile(
    (a) => a.key === 'disk',
    wrong
      ? [
          {
            key: 'disk',
            kind: 'disk',
            subject: 'The disk',
            message: `${Math.round(share * 100)}% full, ${left} GB left`,
          },
        ]
      : []
  );
}

/** One look at a website, as the monitor took it. */
export type SiteResult = {
  key: string;
  name: string;
  ok: boolean;
  status?: number;
  error?: string;
};

/** Websites: wrong after three failed checks in a row, right after one answer. */
export async function checkSites(checks: SiteResult[]) {
  const findings: Finding[] = [];
  for (const check of checks) {
    const fails = check.ok ? 0 : (memory.siteFails.get(check.key) ?? 0) + 1;
    memory.siteFails.set(check.key, fails);
    if (fails >= SITE_FAILS) {
      findings.push({
        key: check.key,
        kind: 'site',
        subject: check.name,
        message: check.status
          ? `Answering ${check.status}`
          : (check.error ?? 'No answer'),
      });
    }
  }
  // A site no longer checked, its tile removed, closes too
  await reconcile((a) => a.kind === 'site', findings);
}

/** The certificate a host shows on 443, and why it isn't trusted, if it isn't; nothing if it can't be reached. */
function certOf(host: string) {
  return new Promise<{ validTo?: number; problem?: string }>((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      // Read even one that isn't trusted, to say why
      rejectUnauthorized: false,
      timeout: 10_000,
    });
    const done = (result: { validTo?: number; problem?: string }) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      done({
        validTo: cert.valid_to ? Date.parse(cert.valid_to) : undefined,
        problem: socket.authorized
          ? undefined
          : String(socket.authorizationError ?? 'Not trusted'),
      });
    });
    // One that can't be reached at all says nothing about its certificate;
    // the website's own check says it's down
    socket.once('timeout', () => done({}));
    socket.once('error', () => done({}));
  });
}

/** What's wrong with a certificate that runs out at `validTo`, if anything. */
export function certProblem(validTo: number | undefined, now = Date.now()) {
  if (validTo === undefined) return undefined;
  const left = (validTo - now) / DAY_MS;
  if (left <= 0) return 'Certificate has run out';
  if (left >= CERT_DAYS) return undefined;
  // In whole days, rounded up, so its last hours are "1 day"
  const days = Math.ceil(left);
  return `Certificate runs out in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Certificates, every six hours: each https address on a tile, the
 * websites' and the services' own, wrong when it runs out within two weeks
 * or isn't trusted.
 */
export async function checkCerts(containers: Container[]) {
  if (Date.now() - memory.certsAt < CERT_EVERY_MS) return;
  memory.certsAt = Date.now();
  const tiles = await db.tile.findMany({ select: { addresses: true } });
  const links = [
    ...tiles.flatMap((t) => t.addresses),
    ...containers.flatMap((c) => c.labels['homepage.href'] ?? []),
  ];
  const hosts = new Set<string>();
  for (const entry of links) {
    if (!isLink(entry)) continue;
    const url = siteUrl([entry]);
    if (url?.protocol === 'https:') hosts.add(url.hostname);
  }
  const findings: Finding[] = [];
  await Promise.all(
    [...hosts].map(async (host) => {
      const { validTo, problem } = await certOf(host);
      const message = problem
        ? `Certificate: ${problem}`
        : certProblem(validTo);
      if (message) {
        findings.push({
          key: `cert:${host}`,
          kind: 'cert',
          subject: host,
          message,
        });
      }
    })
  );
  await reconcile((a) => a.kind === 'cert', findings);
}
