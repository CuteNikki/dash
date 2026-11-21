'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { setToastWords } from '@/components/common/toasts';

/** Gives attempt() and copyText() their words in the page's language. */
export function ToastWords() {
  const t = useTranslations('toasts');
  useEffect(() => {
    setToastWords({ noAnswer: t('noAnswer'), copyFailed: t('copyFailed') });
  }, [t]);
  return null;
}
