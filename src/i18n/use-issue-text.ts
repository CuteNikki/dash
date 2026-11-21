'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * A validation issue's message in the page's language, for a schema checked
 * in the browser too: its keys are under "errors", and anything else, as
 * zod's own, is said as it is.
 */
export function useIssueText() {
  const t = useTranslations('errors');
  return useCallback(
    (message: string | undefined) =>
      !message
        ? undefined
        : t.has(message as never)
          ? (t as (key: string) => string)(message)
          : message,
    [t]
  );
}
