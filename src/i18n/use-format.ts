'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { createFormat } from '@/i18n/format';

/** Numbers, sizes and moments in the page's language. */
export function useFormat() {
  const locale = useLocale();
  const t = useTranslations('format');
  return useMemo(() => createFormat(locale, t), [locale, t]);
}
