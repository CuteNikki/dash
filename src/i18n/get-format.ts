import 'server-only';

import { getLocale, getTranslations } from 'next-intl/server';

import { createFormat } from '@/i18n/format';
import type { Locale } from '@/i18n/locales';

/** Numbers, sizes and moments on the server: in the request's language, or one asked for, as a mail's reader's. */
export async function getFormat(locale?: Locale) {
  const lang = locale ?? (await getLocale());
  return createFormat(
    lang,
    await getTranslations({ locale: lang, namespace: 'format' })
  );
}
