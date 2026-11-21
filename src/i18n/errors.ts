import 'server-only';

import { getTranslations } from 'next-intl/server';

/** Why something was refused, in the asker's language: a key under "errors", with its values. */
export async function errorText(
  key: Parameters<Awaited<ReturnType<typeof getTranslations<'errors'>>>>[0],
  values?: Record<string, string | number>
) {
  const t = await getTranslations('errors');
  return (t as (key: string, values?: object) => string)(key, values);
}

/**
 * A validation issue's message in the asker's language: the schemas give
 * keys under "errors", and anything else, as zod's own, is said as it is.
 */
export async function issueText(message: string | undefined) {
  if (!message) return '';
  const t = await getTranslations('errors');
  return t.has(message as never)
    ? (t as (key: string) => string)(message)
    : message;
}
