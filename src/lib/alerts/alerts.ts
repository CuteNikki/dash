import 'server-only';

import { can, ROLES } from '@/lib/auth/roles';
import { db } from '@/lib/db';
import { formatDuration } from '@/lib/format';
import { mailReady, sendMail } from '@/lib/mail/mail';
import { SERVER_NAME, SITE_URL } from '@/lib/site';

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
    const server = SERVER_NAME ?? 'the server';
    const subject =
      due.length === 1 && !resolved.length
        ? `${due[0].subject}: ${due[0].message}`
        : !due.length && resolved.length === 1
          ? `${resolved[0].subject} is all right again`
          : `${due.length ? `${due.length} new alert${due.length === 1 ? '' : 's'}` : ''}${due.length && resolved.length ? ', ' : ''}${resolved.length ? `${resolved.length} resolved` : ''} on ${server}`;
    try {
      await sendMail({
        to,
        subject,
        paragraphs: [
          ...(due.length
            ? [
                `Wrong on ${server}:`,
                due
                  .map(
                    (a) =>
                      `• ${a.subject}: ${a.message}, for ${formatDuration((now - a.since.getTime()) / 1000)}`
                  )
                  .join('\n'),
              ]
            : []),
          ...(resolved.length
            ? [
                'All right again:',
                resolved
                  .map(
                    (a) =>
                      `• ${a.subject}, after ${formatDuration((a.resolvedAt!.getTime() - a.since.getTime()) / 1000)}`
                  )
                  .join('\n'),
              ]
            : []),
        ],
        action: { label: 'Open the dashboard', url: SITE_URL.href },
        footer: `Sent by the dashboard of ${server} to those who see the server. Turn these off in Settings → Account.`,
      });
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
