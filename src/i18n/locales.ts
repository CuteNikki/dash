/** The languages the dashboard speaks, English first, as what it falls back to. */
export const LOCALES = ['en', 'de'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each language by its own name, as the setting lists them. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
};

/** The cookie holding a person's language, set from their setting, read on every page. */
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/**
 * The first of a browser's languages the dashboard speaks, by the
 * Accept-Language header, its own order kept: "de-DE,de;q=0.9,en;q=0.8" → de.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  const wanted = (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return {
        tag: tag.trim().toLowerCase(),
        q: q ? Number(q.split('=')[1]) : 1,
      };
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
