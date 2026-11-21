import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Locale } from '@/i18n/locales';
import de from '@/i18n/messages/de.json';
import en from '@/i18n/messages/en.json';

import type { WidgetStat } from '@/lib/types';

import { WidgetStats } from '@/components/charts/widget-stats';

const MESSAGES = { en, de };

/** Each chip as it reads: its value, then its label, as the page lays them out. */
function chips(locale: Locale, stats: WidgetStat[]) {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone='UTC'
    >
      <WidgetStats stats={stats} />
    </NextIntlClientProvider>
  );
  const text = (html: string) => html.replace(/<[^>]*>/g, '');
  // Each chip's label, then its value, as the markup has them
  return [
    ...html.matchAll(/<dt class="([^"]*)">(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g),
  ].map(([, classes, label, value]) =>
    classes.includes('sr-only') ? text(value) : `${text(value)} ${text(label)}`
  );
}

const DASHBOARD: WidgetStat[] = [
  { label: 'services', value: { number: 26 } },
  { label: 'users', value: { number: 1 } },
  { label: 'alerts', value: { number: 0 } },
];

describe('WidgetStats', () => {
  test('counts one in the singular, others in the plural', () => {
    expect(chips('en', DASHBOARD)).toEqual([
      '26 services',
      '1 user',
      '0 alerts',
    ]);
    expect(chips('de', DASHBOARD)).toEqual([
      '26 Dienste',
      '1 Nutzer',
      '0 Warnungen',
    ]);
    expect(chips('en', [{ label: 'servers', value: { number: 1 } }])).toEqual([
      '1 server',
    ]);
  });

  test('puts a share in the plural, however many', () => {
    expect(chips('en', [{ label: 'players', value: '1 / 1' }])).toEqual([
      '1 / 1 players',
    ]);
  });

  test("writes sizes in the language's own way, and words of a chip's own", () => {
    expect(chips('de', [{ label: 'used', value: { bytes: 1536 } }])).toEqual([
      '1,5 KB belegt',
    ]);
    expect(
      chips('en', [
        { label: 'onAir', bare: true, value: { says: 'offline' }, tone: 'off' },
      ])
    ).toEqual(['offline']);
  });
});
