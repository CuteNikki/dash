import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { SERVER_NAME, SITE_URL } from '@/lib/site';

/**
 * Mail goes out through an SMTP server, Stalwart on this one, as the other
 * sites' does: SMTP_URL is the login and the server as one address,
 * smtps://dash%40example.com:password@mail.example.com, the @ in the user
 * written as %40; EMAIL_FROM is who it's from, "Dashboard <dash@example.com>",
 * an address that account may send as, its own or an alias of it, else the
 * account's own. Without SMTP_URL nothing is sent, and what would be says so.
 */
const SMTP_URL = process.env.SMTP_URL || undefined;

/** Whether the dashboard can send mail. */
export const mailReady = () => Boolean(SMTP_URL);

/** Who mail's from: EMAIL_FROM, or the account it's sent with. */
function sender() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const user = decodeURIComponent(new URL(SMTP_URL!).username);
  return `Dashboard <${user}>`;
}

// One transport for the process, kept across development's hot reloads
const kept = globalThis as typeof globalThis & { mailer?: Transporter };

function mailer() {
  kept.mailer ??= nodemailer.createTransport(SMTP_URL);
  return kept.mailer;
}

/** A fact of what a mail's about, as a row of its details: "Account", "nikki@example.com". */
export type MailDetail = { label: string; value: string };

/** A thing in a mail's list, as an alert: what it's about, what's up, and when. */
export type MailItem = { title: string; text?: string; meta?: string };

/** A list in a mail, its items marked in the colour of what they are. */
export type MailSection = {
  heading: string;
  /** Wrong (red), all right (green), or neither (grey) */
  tone?: 'destructive' | 'success';
  items: MailItem[];
};

/** A mail as the dashboard writes them: what it's about, its details, and maybe a button to a link. */
export type Mail = {
  /** The language it's in, its reader's */
  lang: string;
  to: string | string[];
  subject: string;
  /** The heading over the text; the subject when not given */
  heading?: string;
  /** What it's about, each a paragraph */
  paragraphs: string[];
  /** Someone's own words, set apart after the paragraphs: an invite's note */
  quote?: { by: string; text: string };
  /** Lists of things, such as alerts, after the paragraphs */
  sections?: MailSection[];
  /** The facts of it, row by row: whose account, when, from where */
  details?: MailDetail[];
  /** A link to act on, as a button; the plain text writes its address out */
  action?: { label: string; url: string };
  /** After the button, quieter: what to do if it wasn't them */
  note?: string;
  /** Small print under it all: why they got it */
  footer: string;
};

/**
 * The dashboard's light theme (see globals.css), as hex: most mail clients
 * don't know oklch. Light only, as the mail says it is, since clients that
 * darken mail on their own would otherwise turn some of it and not the rest.
 */
const colors = {
  page: '#f4f4f4',
  card: '#ffffff',
  primary: '#171717',
  foreground: '#0a0a0a',
  muted: '#636363',
  // A card's ring: the foreground at 10% on white
  ring: '#e7e7e7',
  border: '#e5e5e5',
  // What's picked in a list, a shade off the card
  tint: '#f7f7f7',
  destructive: '#be0000',
  success: '#006f2b',
  // The icon's (src/app/icon.svg)
  iconMain: '#27272a',
  iconSide: '#a1a1aa',
  iconDot: '#16a34a',
};

/** Geist where it's installed, as on the site, else the system's own */
const font =
  "font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

const text = (t: string) => escape(t).replaceAll('\n', '<br>');

/** Someone's own words, who wrote them over them, set off by a bar at the left. */
function quote({ by, text: words }: { by: string; text: string }) {
  return `<tr><td style="padding:16px 0 0;${font}font-size:13px;line-height:1.5;color:${colors.muted};">${escape(by)}</td></tr>
<tr><td style="padding:6px 0 0 12px;border-left:3px solid ${colors.border};${font}font-size:14px;line-height:1.6;color:${colors.foreground};">${text(words)}</td></tr>`;
}

/** A table that's only for layout, which screen readers read past. */
const table = (style: string, rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;${style}">${rows}</table>`;

/**
 * The dashboard's icon from table cells rather than an image, so it shows
 * even where a mail's images aren't loaded.
 */
function icon() {
  const tile = (color: string, radius: string) =>
    `<td width="9" height="9" style="width:9px;height:9px;background:${color};border-radius:${radius};font-size:0;line-height:0;">&nbsp;</td>`;
  const gap =
    '<td width="2" style="width:2px;font-size:0;line-height:0;">&nbsp;</td>';
  return table(
    '',
    `<tr>${tile(colors.iconMain, '2px')}${gap}${tile(colors.iconSide, '2px')}</tr>
<tr><td colspan="3" height="2" style="height:2px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr>${tile(colors.iconSide, '2px')}${gap}${tile(colors.iconDot, '50%')}</tr>`
  );
}

/** The icon, the name and the server, above the card */
function brand() {
  const server = SERVER_NAME
    ? `<span style="color:${colors.muted};font-weight:400;">&nbsp;&middot;&nbsp;${escape(SERVER_NAME)}</span>`
    : '';
  return table(
    '',
    `<tr>
<td style="padding-right:10px;vertical-align:middle;">${icon()}</td>
<td style="vertical-align:middle;${font}font-size:14px;font-weight:600;color:${colors.foreground};">Dashboard${server}</td>
</tr>`
  );
}

/** Labels on the left, their values on the right, a line between each */
function details(rows: MailDetail[]) {
  const cells = rows.map(
    (row, i) => `<tr>
<td class="detail-label" valign="top" style="padding:10px 16px 10px 0;${i ? `border-top:1px solid ${colors.border};` : ''}${font}font-size:13px;line-height:1.5;color:${colors.muted};white-space:nowrap;">${escape(row.label)}</td>
<td class="detail-value" valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${colors.border};` : ''}${font}font-size:13px;line-height:1.5;color:${colors.foreground};word-break:break-word;">${text(row.value)}</td>
</tr>`
  );
  return `<tr><td style="padding:20px 0 0;">${table(
    `width:100%;background:${colors.tint};border:1px solid ${colors.border};border-radius:8px;`,
    `<tr><td style="padding:2px 16px;">${table('width:100%;', cells.join(''))}</td></tr>`
  )}</td></tr>`;
}

function section({ heading, tone, items }: MailSection) {
  const dot = tone ? colors[tone] : colors.muted;
  const rows = items.map(
    (item, i) => `<tr>
<td width="18" valign="top" style="width:18px;padding:16px 0 0;${i ? `border-top:1px solid ${colors.border};` : ''}"><div style="width:8px;height:8px;border-radius:50%;background:${dot};font-size:0;line-height:0;">&nbsp;</div></td>
<td valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${colors.border};` : ''}${font}font-size:14px;line-height:1.5;color:${colors.foreground};">
<div style="font-weight:600;">${escape(item.title)}</div>${
      item.text
        ? `<div style="color:${colors.foreground};">${text(item.text)}</div>`
        : ''
    }${
      item.meta
        ? `<div style="font-size:13px;color:${colors.muted};">${text(item.meta)}</div>`
        : ''
    }</td>
</tr>`
  );
  return `<tr><td style="padding:16px 0 0;${font}font-size:13px;font-weight:600;color:${colors.muted};">${escape(heading)}</td></tr>
<tr><td style="padding:6px 0 0;">${table(
    `width:100%;border:1px solid ${colors.border};border-radius:8px;`,
    `<tr><td style="padding:2px 16px;">${table('width:100%;', rows.join(''))}</td></tr>`
  )}</td></tr>`;
}

/** In a table cell, so Outlook paints the whole button and not only behind its label */
function button(action: NonNullable<Mail['action']>) {
  return `<tr><td style="padding:24px 0 0;">${table(
    '',
    `<tr><td style="background:${colors.primary};border-radius:6px;">
<a href="${escape(action.url)}" style="display:inline-block;padding:10px 18px;${font}font-size:14px;line-height:20px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:6px;">${escape(action.label)}</a>
</td></tr>`
  )}</td></tr>`;
}

/** The mail as plain text, a part for each part of the HTML */
function plain(mail: Mail, footer: string) {
  return [
    mail.heading ?? mail.subject,
    ...mail.paragraphs,
    ...(mail.quote
      ? [
          `${mail.quote.by}\n${mail.quote.text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')}`,
        ]
      : []),
    ...(mail.sections ?? []).map(
      (s) =>
        `${s.heading}\n${s.items
          .map(
            (item) =>
              `- ${[item.title, item.text].filter(Boolean).join(': ')}${item.meta ? ` (${item.meta})` : ''}`
          )
          .join('\n')}`
    ),
    ...(mail.details?.length
      ? [mail.details.map((d) => `${d.label}: ${d.value}`).join('\n')]
      : []),
    ...(mail.action ? [`${mail.action.label}:\n${mail.action.url}`] : []),
    ...(mail.note ? [mail.note] : []),
    `--\n${footer}\n${SITE_URL.host}`,
  ].join('\n\n');
}

/** The mail as plain text, and as HTML in the dashboard's colours. */
function render(mail: Mail) {
  const footer = mail.footer;
  const paragraphs = mail.paragraphs.map(
    (p, i) =>
      `<tr><td style="padding:${i ? 12 : 8}px 0 0;${font}font-size:14px;line-height:1.6;color:${colors.foreground};">${text(p)}</td></tr>`
  );
  const card = table(
    `width:100%;background:${colors.card};border:1px solid ${colors.ring};border-radius:8px;`,
    `<tr><td class="card" style="padding:28px 28px 32px;">${table(
      'width:100%;',
      `<tr><td style="${font}font-size:20px;line-height:1.3;font-weight:600;color:${colors.foreground};">${escape(mail.heading ?? mail.subject)}</td></tr>
${paragraphs.join('\n')}
${mail.quote ? quote(mail.quote) : ''}
${(mail.sections ?? []).map(section).join('\n')}
${mail.details?.length ? details(mail.details) : ''}
${mail.action ? button(mail.action) : ''}
${mail.note ? `<tr><td style="padding:20px 0 0;${font}font-size:13px;line-height:1.6;color:${colors.muted};">${text(mail.note)}</td></tr>` : ''}`
    )}</td></tr>`
  );
  const html = `<!doctype html>
<html lang="${escape(mail.lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escape(mail.subject)}</title>
<style>
/* On a phone: less padding, and each detail's label over its value. Clients
   that drop this get the wide layout, which still works, only tighter. */
@media (max-width: 480px) {
  .card { padding: 22px 20px 24px !important; }
  .detail-label, .detail-value { display: block !important; width: auto !important; }
  .detail-label { padding: 10px 0 0 !important; white-space: normal !important; }
  .detail-value { padding: 2px 0 10px !important; border-top: 0 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${colors.page};">
<div style="display:none;max-height:0;overflow:hidden;">${escape(mail.paragraphs[0] ?? '')}</div>
${table(
  `width:100%;background:${colors.page};`,
  `<tr><td align="center" style="padding:32px 16px;">${table(
    'width:100%;max-width:520px;',
    `<tr><td style="padding:0 4px 16px;">${brand()}</td></tr>
<tr><td>${card}</td></tr>
<tr><td style="padding:16px 4px 0;${font}font-size:12px;line-height:1.6;color:${colors.muted};">${text(footer)}<br><a href="${escape(SITE_URL.href)}" style="color:${colors.muted};">${escape(SITE_URL.host)}</a></td></tr>`
  )}</td></tr>`
)}
</body>
</html>`;
  return { text: plain(mail, footer), html };
}

/** Sends a mail, or throws why it couldn't, as when mail isn't set up. */
export async function sendMail(mail: Mail) {
  if (!mailReady()) {
    throw new Error("Mail isn't set up: SMTP_URL in the dashboard's .env");
  }
  await mailer().sendMail({
    from: sender(),
    to: mail.to,
    subject: mail.subject,
    ...render(mail),
    // A unique value stops Gmail from grouping mails with the same subject,
    // such as alerts, into one conversation that hides the repeated text
    headers: { 'X-Entity-Ref-ID': crypto.randomUUID() },
  });
}
