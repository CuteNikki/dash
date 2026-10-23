import 'server-only';

import { ROLE_INFO, type Role } from '@/lib/auth/roles';
import { formatDuration } from '@/lib/format';
import type { Mail } from '@/lib/mail/mail';
import { SERVER_NAME, SITE_URL } from '@/lib/site';

/**
 * Every mail the dashboard sends, worded in one place: who it's to and
 * where its link goes are filled in by what sends it.
 */

type Who = { name: string; email: string };

export function resetPasswordMail(user: Who, url: string): Mail {
  return {
    to: user.email,
    subject: 'Reset your password',
    paragraphs: [
      `Hi ${user.name},`,
      'Someone asked to reset the password of your account on the dashboard. If it was you, pick a new one here; the link works for an hour.',
      "If it wasn't, there's nothing to do: your password stays as it is.",
    ],
    action: { label: 'Pick a new password', url },
  };
}

export function confirmAddressMail(user: Who, url: string): Mail {
  return {
    to: user.email,
    subject: 'Confirm your email address',
    paragraphs: [
      `Hi ${user.name},`,
      "Confirm this is your address, so the dashboard's mail reaches you: a forgotten password, and alerts if you get them. The link works for an hour.",
    ],
    action: { label: 'Confirm my address', url },
  };
}

export function changeAddressMail(
  user: Who,
  newEmail: string,
  url: string
): Mail {
  return {
    to: user.email,
    subject: 'Change your email address?',
    paragraphs: [
      `Hi ${user.name},`,
      `Someone signed in as you asked to change your account's address to ${newEmail}. If it was you, agree to it here; the new address is then sent a link to confirm it.`,
      "If it wasn't, don't open the link, and change your password.",
    ],
    action: { label: `Change it to ${newEmail}`, url },
  };
}

export function inviteMail(invite: {
  email: string;
  role: Role;
  invitedBy: string;
  url: string;
}): Mail {
  const info = ROLE_INFO[invite.role];
  return {
    to: invite.email,
    subject: `You're invited to ${SERVER_NAME ?? 'the dashboard'}`,
    paragraphs: [
      'Hi,',
      `${invite.invitedBy} invited you to the dashboard of ${SERVER_NAME ?? 'their server'}, as ${info.name.toLowerCase()}: ${info.description.toLowerCase()}.`,
      'Make your account with the link below. It works once, for 24 hours.',
    ],
    action: { label: 'Make my account', url: invite.url },
    footer: `Sent by the dashboard of ${SERVER_NAME ?? 'a server'} for ${invite.invitedBy}. If you weren't expecting it, there's nothing to do: the link runs out by itself.`,
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
  const server = SERVER_NAME ?? 'the server';
  const counts = [
    due.length && `${due.length} new alert${due.length === 1 ? '' : 's'}`,
    resolved.length && `${resolved.length} resolved`,
  ].filter(Boolean);
  const subject =
    due.length === 1 && !resolved.length
      ? `${due[0].subject}: ${due[0].message}`
      : !due.length && resolved.length === 1
        ? `${resolved[0].subject} is all right again`
        : `${counts.join(', ')} on ${server}`;
  return {
    to,
    subject,
    paragraphs: [
      ...(due.length
        ? [
            `Wrong on ${server}:`,
            due
              .map(
                (a) =>
                  `• ${a.subject}: ${a.message}, for ${lasted(a.since, now)}`
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
                  `• ${a.subject}, after ${lasted(a.since, a.resolvedAt!.getTime())}`
              )
              .join('\n'),
          ]
        : []),
    ],
    action: { label: 'Open the dashboard', url: SITE_URL.href },
    footer: `Sent by the dashboard of ${server} to those who see the server. Turn these off in Settings → Account.`,
  };
}
