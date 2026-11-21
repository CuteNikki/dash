import 'server-only';

import { createTranslator } from 'next-intl';

import { createFormat } from '@/i18n/format';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { messagesFor } from '@/i18n/request';

import { db } from '@/lib/db';

/**
 * What a mail says, in its reader's language: its words, the roles', and
 * its times and lengths of time. Made outside of any request, as the
 * monitor's alerts are, so from the messages themselves.
 */
export async function mailWords(locale: string | null | undefined) {
  const lang: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = await messagesFor(lang);
  const t = createTranslator({ locale: lang, messages, namespace: 'mail' });
  const roles = createTranslator({
    locale: lang,
    messages,
    namespace: 'roles',
  });
  const format = createFormat(
    lang,
    createTranslator({ locale: lang, messages, namespace: 'format' })
  );
  /**
   * A moment, written out with its zone, as a mail's reader may be anywhere
   * and read it any time later: "20 Nov 2026, 18:42 CET". In the server's
   * own zone (TZ), the one its logs are in.
   */
  const time = (at: Date | number) =>
    new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(at);
  const agent = createTranslator({
    locale: lang,
    messages,
    namespace: 'agent',
  });
  const alertWords = createTranslator({
    locale: lang,
    messages,
    namespace: 'alertWords',
  }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;
  return { lang, t, roles, format, time, agent, alertWords };
}

export type MailWords = Awaited<ReturnType<typeof mailWords>>;

/** A person's mail words, in the language they chose, or English. */
export async function wordsFor(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  return mailWords(user?.locale);
}
