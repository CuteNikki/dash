import 'server-only';

import type { Role } from '@/lib/auth/roles';
import type { Mail, MailDetail } from '@/lib/mail/mail';
import type { MailWords } from '@/lib/mail/words';
import { SERVER_NAME, SITE_URL } from '@/lib/site';
import type { AlertWords } from '@/lib/types';

import { describeAgent } from '@/components/settings/user-agent';

/**
 * Every mail the dashboard sends, worded in one place, in its reader's
 * language by mailWords(): who it's to and where its link goes are filled
 * in by what sends it.
 */

type Who = { name: string; email: string };

/** Where a request came from, as far as it says: the browser, and the address Caddy saw it from. */
export type Origin = { userAgent?: string | null; ip?: string | null };

/** The origin of a request to the auth routes, which come through Caddy. */
export function originOf(request?: Request): Origin | undefined {
  if (!request) return undefined;
  return {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  };
}

/** When it was asked for and from what, as far as the request says */
function requested(
  w: MailWords,
  origin: Origin | undefined,
  now: number
): MailDetail[] {
  const from = [
    origin?.userAgent ? describeAgent(origin.userAgent, w.agent) : undefined,
    origin?.ip || undefined,
  ].filter(Boolean);
  return [
    { label: w.t('requested'), value: w.time(now) },
    ...(from.length ? [{ label: w.t('from'), value: from.join(', ') }] : []),
  ];
}

/** The server, by its name, or in words where it has none. */
const server = (w: MailWords) => SERVER_NAME ?? w.t('yourServer');

/** The small print every mail ends with, unless it says more. */
const footer = (w: MailWords) => w.t('footer', { server: server(w) });

export function resetPasswordMail(
  w: MailWords,
  user: Who,
  url: string,
  expiresAt: Date,
  origin?: Origin,
  now = Date.now()
): Mail {
  return {
    lang: w.lang,
    to: user.email,
    subject: w.t('reset.subject'),
    paragraphs: [w.t('reset.text', { name: user.name, server: server(w) })],
    details: [
      { label: w.t('account'), value: user.email },
      ...requested(w, origin, now),
      { label: w.t('linkUntil'), value: w.time(expiresAt) },
    ],
    action: { label: w.t('reset.action'), url },
    note: w.t('reset.note'),
    footer: footer(w),
  };
}

export function confirmAddressMail(
  w: MailWords,
  user: Who,
  url: string,
  expiresAt: Date
): Mail {
  return {
    lang: w.lang,
    to: user.email,
    subject: w.t('confirm.subject'),
    paragraphs: [w.t('confirm.text', { name: user.name, server: server(w) })],
    details: [
      { label: w.t('account'), value: user.name },
      { label: w.t('address'), value: user.email },
      { label: w.t('linkUntil'), value: w.time(expiresAt) },
    ],
    action: { label: w.t('confirm.action'), url },
    note: w.t('confirm.note'),
    footer: footer(w),
  };
}

export function changeAddressMail(
  w: MailWords,
  user: Who,
  newEmail: string,
  url: string,
  expiresAt: Date,
  origin?: Origin,
  now = Date.now()
): Mail {
  return {
    lang: w.lang,
    to: user.email,
    subject: w.t('change.subject'),
    heading: w.t('change.heading'),
    paragraphs: [w.t('change.text', { name: user.name, server: server(w) })],
    details: [
      { label: w.t('currentAddress'), value: user.email },
      { label: w.t('newAddress'), value: newEmail },
      ...requested(w, origin, now),
      { label: w.t('linkUntil'), value: w.time(expiresAt) },
    ],
    action: { label: w.t('change.action'), url },
    note: w.t('change.note'),
    footer: footer(w),
  };
}

export function inviteMail(
  w: MailWords,
  invite: {
    email: string;
    role: Role;
    invitedBy: string;
    url: string;
    expiresAt: Date;
    /** A few words of the inviter's own */
    message?: string;
  }
): Mail {
  return {
    lang: w.lang,
    to: invite.email,
    subject: SERVER_NAME
      ? w.t('invite.subject', { server: SERVER_NAME })
      : w.t('invite.subjectDashboard'),
    heading: SERVER_NAME
      ? w.t('invite.heading', { server: SERVER_NAME })
      : w.t('invite.headingDashboard'),
    paragraphs: [
      SERVER_NAME
        ? w.t('invite.text', { by: invite.invitedBy, server: SERVER_NAME })
        : w.t('invite.textTheirs', { by: invite.invitedBy }),
    ],
    ...(invite.message && {
      quote: {
        by: w.t('invite.wrote', { by: invite.invitedBy }),
        text: invite.message,
      },
    }),
    details: [
      { label: w.t('invitedBy'), value: invite.invitedBy },
      {
        label: w.t('role'),
        value: `${w.roles(`${invite.role}.name`)}: ${w.roles(`${invite.role}.abilities`)}`,
      },
      { label: w.t('for'), value: invite.email },
      { label: w.t('inviteUntil'), value: w.time(invite.expiresAt) },
    ],
    action: { label: w.t('invite.action'), url: invite.url },
    note: w.t('invite.note'),
    footer: w.t('invite.footer', {
      server: SERVER_NAME ?? w.t('aServer'),
      by: invite.invitedBy,
    }),
  };
}

type AlertLine = {
  subject: string;
  message: string;
  /** The two in words for each reader's language; none in alerts from before them */
  words?: AlertWords | null;
  since: Date;
  resolvedAt?: Date | null;
};

/** A round of alerts: what's newly wrong, and what's right again, in one mail. */
export function alertsMail(
  w: MailWords,
  to: string[],
  due: AlertLine[],
  resolved: AlertLine[],
  now = Date.now()
): Mail {
  const name = SERVER_NAME ?? w.t('theServer');
  const lasted = (from: Date, until: number) =>
    w.format.duration((until - from.getTime()) / 1000);
  // In the reader's language where it has words, else as it was kept
  const subjectOf = (a: AlertLine) =>
    a.words?.subject
      ? w.alertWords(a.words.subject.key, a.words.subject.values)
      : a.subject;
  const messageOf = (a: AlertLine) =>
    a.words?.message
      ? w.alertWords(a.words.message.key, a.words.message.values)
      : a.message;
  const subject =
    due.length === 1 && !resolved.length
      ? `${subjectOf(due[0])}: ${messageOf(due[0])}`
      : !due.length && resolved.length === 1
        ? w.t('alerts.oneRight', { subject: subjectOf(resolved[0]) })
        : w.t('alerts.counts', {
            due: due.length,
            resolved: resolved.length,
            server: name,
          });
  return {
    lang: w.lang,
    to,
    subject,
    heading: due.length
      ? w.t('alerts.wrongHeading', { server: name })
      : w.t('alerts.rightHeading', { server: name }),
    paragraphs: [
      due.length
        ? w.t('alerts.wrongText', {
            count: due.length,
            alsoRight: resolved.length ? 'yes' : 'no',
          })
        : w.t('alerts.rightText', { count: resolved.length }),
    ],
    sections: [
      ...(due.length
        ? [
            {
              heading: w.t('alerts.wrongNow'),
              tone: 'destructive' as const,
              items: due.map((a) => ({
                title: subjectOf(a),
                text: messageOf(a),
                meta: w.t('alerts.since', {
                  since: w.time(a.since),
                  lasted: lasted(a.since, now),
                }),
              })),
            },
          ]
        : []),
      ...(resolved.length
        ? [
            {
              heading: w.t('alerts.rightAgain'),
              tone: 'success' as const,
              items: resolved.map((a) => ({
                title: subjectOf(a),
                text: w.t('alerts.was', { message: messageOf(a) }),
                meta: w.t('alerts.lasted', {
                  lasted: lasted(a.since, a.resolvedAt!.getTime()),
                  until: w.time(a.resolvedAt!),
                }),
              })),
            },
          ]
        : []),
    ],
    action: { label: w.t('alerts.action'), url: SITE_URL.href },
    footer: w.t('alerts.footer', { server: name }),
  };
}
