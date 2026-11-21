'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { syncLocale } from '@/actions/account';

import type { Locale } from '@/i18n/locales';

/**
 * On a device the page came in another language to than they chose, their
 * browser's, the cookie is brought to theirs and the page drawn again in it:
 * once on each device, as the cookie then says it.
 */
export function LocaleSync({ chosen }: { chosen: Locale | null }) {
  const locale = useLocale();
  const router = useRouter();
  useEffect(() => {
    if (!chosen || chosen === locale) return;
    void syncLocale().then(() => router.refresh());
  }, [chosen, locale, router]);
  return null;
}
