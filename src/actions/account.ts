'use server';

import { cookies } from 'next/headers';

import { isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/locales';

import { requireAccess } from '@/lib/auth/access';
import { db } from '@/lib/db';

/** Whether the monitor's alerts are mailed to whoever's signed in, for those who see the server. */
export async function setAlertMail(on: boolean): Promise<{ error?: string }> {
  const access = await requireAccess('server');
  if (typeof on !== 'boolean') return { error: 'On or off' };
  await db.user.update({
    where: { id: access.user.id },
    data: { alertMail: on },
  });
  return {};
}

/** Keeps a language in the cookie every page reads it from, for a year. */
async function keepLocale(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Their language, kept on them for their mails and other devices, and in this browser's cookie. */
export async function setLocale(locale: Locale): Promise<{ error?: string }> {
  const access = await requireAccess('view');
  if (!isLocale(locale))
    return { error: 'Not a language the dashboard speaks' };
  await db.user.update({ where: { id: access.user.id }, data: { locale } });
  await keepLocale(locale);
  return {};
}

/** Brings this browser's cookie to the language they chose on another device. */
export async function syncLocale(): Promise<void> {
  const access = await requireAccess('view');
  const user = await db.user.findUnique({
    where: { id: access.user.id },
    select: { locale: true },
  });
  if (isLocale(user?.locale)) await keepLocale(user.locale);
}
