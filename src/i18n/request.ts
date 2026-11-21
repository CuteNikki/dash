import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  negotiateLocale,
  type Locale,
} from '@/i18n/locales';

/** Each language's messages, loaded only when it's asked for. */
export async function messagesFor(locale: Locale) {
  return (await import(`./messages/${locale}.json`)).default;
}

/**
 * The language a page is in: one asked for outright, as a mail to someone is
 * in theirs; otherwise the person's own, kept in a cookie by their setting;
 * otherwise the first of their browser's the dashboard speaks.
 */
export default getRequestConfig(async ({ locale: asked }) => {
  let locale: Locale = DEFAULT_LOCALE;
  if (isLocale(asked)) {
    locale = asked;
  } else {
    const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
    locale = isLocale(saved)
      ? saved
      : negotiateLocale((await headers()).get('accept-language'));
  }
  return {
    locale,
    messages: await messagesFor(locale),
    // The server's own, as its times are written in mails and pages alike
    timeZone: process.env.TZ || 'UTC',
  };
});
