import { describe, expect, test } from 'bun:test';
import { createTranslator } from 'next-intl';

import { createFormat } from '@/i18n/format';
import type { Locale } from '@/i18n/locales';
import de from '@/i18n/messages/de.json';
import en from '@/i18n/messages/en.json';

const MESSAGES = { en, de };

function formatIn(locale: Locale) {
  return createFormat(
    locale,
    createTranslator({
      locale,
      messages: MESSAGES[locale],
      namespace: 'format',
    })
  );
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('createFormat', () => {
  const english = formatIn('en');
  const german = formatIn('de');

  test("writes sizes and waits with each language's decimal mark", () => {
    expect(english.bytes(1536)).toBe('1.5 KB');
    expect(german.bytes(1536)).toBe('1,5 KB');
    expect(english.bytes(20 * 1024 ** 3)).toBe('20 GB');
    expect(english.ms(1234)).toBe('1.2 s');
    expect(german.ms(1234)).toBe('1,2 s');
    expect(english.ms(140.4)).toBe('140 ms');
  });

  test('writes percentages as each language does', () => {
    expect(english.cpu(0.4)).toBe('0.4%');
    expect(english.cpu(182)).toBe('182%');
    // German puts a space before the sign
    expect(german.cpu(0.4)).toBe('0,4 %');
    expect(english.uptime(0.99974)).toBe('99.97%');
    expect(english.uptime(1)).toBe('100%');
  });

  test('counts days in the plural only past one', () => {
    expect(english.duration(231946)).toBe('2 days 16 h');
    expect(english.duration(86400 + 3600)).toBe('1 day 1 h');
    expect(german.duration(231946)).toBe('2 Tage 16 h');
    expect(german.duration(86400)).toBe('1 Tag 0 h');
    expect(english.duration(3700)).toBe('1 h 1 min');
    expect(english.duration(59)).toBe('0 min');
  });

  test('says how long ago, in the largest unit that fits', () => {
    const now = Date.now();
    expect(english.ago(now - 5 * MINUTE)).toBe('5 min ago');
    expect(german.ago(now - 5 * MINUTE)).toBe('vor 5 min');
    expect(english.ago(now - DAY - MINUTE)).toBe('1 day ago');
    expect(english.ago(now - 3 * DAY)).toBe('3 days ago');
    expect(german.ago(now - 3 * DAY)).toBe('vor 3 Tagen');
    expect(english.ago(now)).toBe('just now');
    expect(german.ago(now)).toBe('gerade eben');
  });

  test('names today and yesterday in its own words', () => {
    const now = Date.now();
    expect(english.past(now)).toStartWith('today ');
    expect(german.past(now)).toStartWith('heute ');
  });
});
