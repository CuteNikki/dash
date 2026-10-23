import 'server-only';

import { can, ROLES } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { mailReady, sendMail } from '@/lib/mail/mail';
import { alertsMail } from '@/lib/mail/templates';

/** What a check finds wrong now. Whatever it checks and doesn't find is fine. */
export type Finding = {
  key: string;
  kind: AlertKind;
  subject: string;
  message: string;
};

export type AlertKind = 'service' | 'disk' | 'site' | 'cert' | 'backup';

/**
 * How long something has to stay wrong before it's mailed, so a restart, or
 * Docker restarting with an upgrade, isn't: two of the monitor's minutes.
 */
const GRACE_MS = 2 * 60_000;

/** How long alerts are kept once they're over. */
export const KEEP_ALERTS_DAYS = 90;

/**
 * Brings the open alerts of what a check covers in line with what it found:
 * opens what's newly wrong, notes a changed message, and closes what's
 * right again. `covers` says which open alerts the check speaks for, so one
 * that looks at a few things doesn't close others'.
 */
export async function reconcile(
  covers: (alert: { key: string; kind: string }) => boolean,
  findings: Finding[]
) {
  const open = await db.alert.findMany({ where: { resolvedAt: null } });
  const found = new Map(findings.map((f) => [f.key, f]));
  const now = new Date();
  for (const alert of open) {
    if (!covers(alert)) continue;
    const finding = found.get(alert.key);
    if (!finding) {
      await db.alert.update({
        where: { id: alert.id },
        data: { resolvedAt: now },
      });
    } else if (finding.message !== alert.message) {
      await db.alert.update({
        where: { id: alert.id },
        data: { message: finding.message, subject: finding.subject },
      });
    }
    found.delete(alert.key);
  }
  if (found.size) {
    await db.alert.createMany({ data: [...found.values()] });
  }
}

/** Who's mailed alerts: those who see the server, who haven't turned them off. */
async function recipients() {
  const people = await db.user.findMany({
    where: {
      alertMail: true,
      banned: { not: true },
      role: { in: ROLES.filter((r) => can(r, 'server')) },
    },
    select: { email: true },
  });
  return people.map((p) => p.email);
}

/**
 * Mails what's newly wrong, once it's lasted past the grace, and what's
 * right again of what was mailed, all in one mail. One that was over within
 * the grace is never mailed at all.
 */
export async function notify() {
  if (!mailReady()) return;
  const now = Date.now();
  const [due, over] = await Promise.all([
    db.alert.findMany({
      where: {
        resolvedAt: null,
        notifiedAt: null,
        since: { lte: new Date(now - GRACE_MS) },
      },
      orderBy: { since: 'asc' },
    }),
    // Over since the last round, and mailed when it began
    db.alert.findMany({
      where: {
        notifiedAt: { not: null },
        resolvedAt: { gte: new Date(now - 10 * 60_000) },
      },
    }),
  ]);
  // Each over one is said once: it's marked by its notifiedAt moving past it
  const resolved = over.filter((a) => a.notifiedAt! < a.resolvedAt!);
  if (!due.length && !resolved.length) return;
  const to = await recipients();
  if (to.length) {
    try {
      await sendMail(alertsMail(to, due, resolved, now));
    } catch (error) {
      // Tried again next round, as nothing's marked
      console.error("Couldn't mail the alerts:", error);
      return;
    }
  }
  const stamp = new Date();
  await db.alert.updateMany({
    where: { id: { in: [...due, ...resolved].map((a) => a.id) } },
    data: { notifiedAt: stamp },
  });
}
