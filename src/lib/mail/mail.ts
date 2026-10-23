import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { SERVER_NAME } from '@/lib/site';

/**
 * Mail goes out through an SMTP server, Stalwart on this one, from an
 * account of its own: SMTP_HOST, SMTP_PORT (465, TLS from the start, unless
 * set otherwise), SMTP_USER, SMTP_PASSWORD, and MAIL_FROM, the address it's
 * from, as "Dashboard <dash@example.com>". Without SMTP_HOST and MAIL_FROM
 * nothing is sent, and what would be says so.
 */
const HOST = process.env.SMTP_HOST || undefined;
const PORT = Number(process.env.SMTP_PORT) || 465;
const FROM = process.env.MAIL_FROM || undefined;

/** Whether the dashboard can send mail. */
export const mailReady = () => Boolean(HOST && FROM);

// One connection pool for the process, as the database's is
const kept = globalThis as typeof globalThis & { mailer?: Transporter };

function mailer() {
  kept.mailer ??= nodemailer.createTransport({
    host: HOST,
    port: PORT,
    // 465 speaks TLS from the start, and 587 must upgrade to it; on any
    // other port it's used when the server offers it
    secure: PORT === 465,
    requireTLS: PORT === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    pool: true,
    connectionTimeout: 15_000,
  });
  return kept.mailer;
}

/** A mail as the dashboard writes them: a few paragraphs, and maybe a button to a link. */
export type Mail = {
  to: string | string[];
  subject: string;
  /** Each a paragraph */
  paragraphs: string[];
  /** A link to act on, as a button, with its address written out too */
  action?: { label: string; url: string };
  /** Small print under it all: why they got it */
  footer?: string;
};

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

/** The mail as plain text, and as plain HTML for clients that show it. */
function render(mail: Mail) {
  const footer =
    mail.footer ?? `Sent by the dashboard of ${SERVER_NAME ?? 'your server'}.`;
  const text = [
    ...mail.paragraphs,
    ...(mail.action ? [`${mail.action.label}: ${mail.action.url}`] : []),
    '—',
    footer,
  ].join('\n\n');
  const p = (t: string, style = '') =>
    `<p style="margin:0 0 16px;${style}">${escape(t).replaceAll('\n', '<br>')}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px">
${mail.paragraphs.map((t) => p(t)).join('\n')}
${
  mail.action
    ? `<p style="margin:24px 0"><a href="${escape(mail.action.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">${escape(mail.action.label)}</a></p>
${p(`Or open ${mail.action.url}`, 'color:#666;font-size:13px;word-break:break-all')}`
    : ''
}
${p(footer, 'color:#888;font-size:12px;margin:24px 0 0')}
</div></body></html>`;
  return { text, html };
}

/** Sends a mail, or throws why it couldn't, as when mail isn't set up. */
export async function sendMail(mail: Mail) {
  if (!mailReady()) {
    throw new Error(
      "Mail isn't set up: SMTP_HOST and MAIL_FROM in the dashboard's .env"
    );
  }
  await mailer().sendMail({
    from: FROM,
    to: mail.to,
    subject: mail.subject,
    ...render(mail),
  });
}
