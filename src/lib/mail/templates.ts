import 'server-only';

import { createTranslator } from 'next-intl';

import en from '@/i18n/messages/en.json';

import { ROLE_INFO, type Role } from '@/lib/auth/roles';
import { formatDuration } from '@/lib/format';
import type { Mail, MailDetail } from '@/lib/mail/mail';
import { SERVER_NAME, SITE_URL } from '@/lib/site';

import { describeAgent } from '@/components/settings/user-agent';

/**
 * Every mail the dashboard sends, worded in one place: who it's to and
 * where its link goes are filled in by what sends it.
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

/**
 * A moment, written out with its zone, as a mail's reader may be anywhere
 * and read it any time later: "20 Nov 2026, 18:42 CET". In the server's
 * own zone (TZ), the one its logs are in.
 */
export function formatMailTime(at: Date | number) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(at);
}

/** When it was asked for and from what, as far as the request says */
function requested(origin: Origin | undefined, now: number): MailDetail[] {
  const from = [
    origin?.userAgent
      ? describeAgent(
          origin.userAgent,
          createTranslator({ locale: 'en', messages: en, namespace: 'agent' })
        )
      : undefined,
    origin?.ip || undefined,
  ].filter(Boolean);
  return [
    { label: 'Requested', value: formatMailTime(now) },
    ...(from.length ? [{ label: 'From', value: from.join(', ') }] : []),
  ];
}

const server = () => SERVER_NAME ?? 'your server';

export function resetPasswordMail(
  user: Who,
  url: string,
  expiresAt: Date,
  origin?: Origin,
  now = Date.now()
): Mail {
  return {
    to: user.email,
    subject: 'Reset your password',
    paragraphs: [
      `Hi ${user.name}, someone asked to reset the password of your account on the dashboard of ${server()}. If it was you, pick a new one with the button below.`,
    ],
    details: [
      { label: 'Account', value: user.email },
      ...requested(origin, now),
      { label: 'Link works until', value: formatMailTime(expiresAt) },
    ],
    action: { label: 'Pick a new password', url },
    note: "If it wasn't you, there's nothing to do: your password stays as it is, and the link runs out by itself. Picking a new one signs you out everywhere else.",
  };
}

export function confirmAddressMail(
  user: Who,
  url: string,
  expiresAt: Date
): Mail {
  return {
    to: user.email,
    subject: 'Confirm your email address',
    paragraphs: [
      `Hi ${user.name}, confirm this is your address, so the dashboard of ${server()} can reach you: to reset a forgotten password, and with alerts if you get them.`,
    ],
    details: [
      { label: 'Account', value: user.name },
      { label: 'Address', value: user.email },
      { label: 'Link works until', value: formatMailTime(expiresAt) },
    ],
    action: { label: 'Confirm my address', url },
    note: "If you don't have an account there, there's nothing to do: the address isn't used until it's confirmed.",
  };
}

export function changeAddressMail(
  user: Who,
  newEmail: string,
  url: string,
  expiresAt: Date,
  origin?: Origin,
  now = Date.now()
): Mail {
  return {
    to: user.email,
    subject: 'Change your email address?',
    heading: 'Change your email address',
    paragraphs: [
      `Hi ${user.name}, someone signed in as you asked to change your account's address on the dashboard of ${server()}. If it was you, agree to it here; the new address is then sent a link to confirm it.`,
    ],
    details: [
      { label: 'Current address', value: user.email },
      { label: 'New address', value: newEmail },
      ...requested(origin, now),
      { label: 'Link works until', value: formatMailTime(expiresAt) },
    ],
    action: { label: 'Agree to the change', url },
    note: "If it wasn't you, don't open the link: someone knows your password. Change it in Settings > Account and sign out your other sessions there.",
  };
}

export function inviteMail(invite: {
  email: string;
  role: Role;
  invitedBy: string;
  url: string;
  expiresAt: Date;
}): Mail {
  const info = ROLE_INFO[invite.role];
  return {
    to: invite.email,
    subject: `You're invited to ${SERVER_NAME ?? 'the dashboard'}`,
    heading: `Join ${SERVER_NAME ?? 'the dashboard'}`,
    paragraphs: [
      `Hi, ${invite.invitedBy} invited you to the dashboard of ${SERVER_NAME ?? 'their server'}. Make your account with the button below: you pick your own name and password.`,
    ],
    details: [
      { label: 'Invited by', value: invite.invitedBy },
      {
        label: 'Role',
        value: `${info.name}: ${info.description[0].toLowerCase()}${info.description.slice(1)}`,
      },
      { label: 'For', value: invite.email },
      { label: 'Invite works until', value: formatMailTime(invite.expiresAt) },
    ],
    action: { label: 'Make my account', url: invite.url },
    note: "The link works once. If you weren't expecting it, there's nothing to do: it runs out by itself.",
    footer: `Sent by the dashboard of ${SERVER_NAME ?? 'a server'} for ${invite.invitedBy}.`,
  };
}

type AlertLine = {
  subject: string;
  message: string;
  since: Date;
  resolvedAt?: Date | null;
};

const lasted = (from: Date, to: number) =>
  formatDuration((to - from.getTime()) / 1000);

/** A round of alerts: what's newly wrong, and what's right again, in one mail. */
export function alertsMail(
  to: string[],
  due: AlertLine[],
  resolved: AlertLine[],
  now = Date.now()
): Mail {
  const name = SERVER_NAME ?? 'the server';
  const counts = [
    due.length && `${due.length} new alert${due.length === 1 ? '' : 's'}`,
    resolved.length && `${resolved.length} resolved`,
  ].filter(Boolean);
  const subject =
    due.length === 1 && !resolved.length
      ? `${due[0].subject}: ${due[0].message}`
      : !due.length && resolved.length === 1
        ? `${resolved[0].subject} is all right again`
        : `${counts.join(', ')} on ${name}`;
  return {
    to,
    subject,
    heading: due.length
      ? `Something's wrong on ${name}`
      : `All right again on ${name}`,
    paragraphs: [
      due.length
        ? `The dashboard found ${due.length === 1 ? 'a problem that has' : `${due.length} problems that have`} lasted a while.${resolved.length ? ' Something it mailed about before is all right again, too.' : ''}`
        : `${resolved.length === 1 ? 'What' : 'Everything'} the dashboard mailed about is all right again.`,
    ],
    sections: [
      ...(due.length
        ? [
            {
              heading: 'Wrong now',
              tone: 'destructive' as const,
              items: due.map((a) => ({
                title: a.subject,
                text: a.message,
                meta: `Since ${formatMailTime(a.since)}, ${lasted(a.since, now)} so far`,
              })),
            },
          ]
        : []),
      ...(resolved.length
        ? [
            {
              heading: 'All right again',
              tone: 'success' as const,
              items: resolved.map((a) => ({
                title: a.subject,
                text: `Was: ${a.message}`,
                meta: `Lasted ${lasted(a.since, a.resolvedAt!.getTime())}, until ${formatMailTime(a.resolvedAt!)}`,
              })),
            },
          ]
        : []),
    ],
    action: { label: 'Open the dashboard', url: SITE_URL.href },
    footer: `Sent by the dashboard of ${name} to everyone who sees the server. Turn these off in Settings > Account.`,
  };
}
