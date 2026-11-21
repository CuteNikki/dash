import { describe, expect, test } from 'bun:test';
import { createTranslator } from 'next-intl';

import de from '@/i18n/messages/de.json';
import en from '@/i18n/messages/en.json';

import { describeAgent, parseAgent } from '@/components/settings/user-agent';

const english = createTranslator({
  locale: 'en',
  messages: en,
  namespace: 'agent',
});
const german = createTranslator({
  locale: 'de',
  messages: de,
  namespace: 'agent',
});

describe('describeAgent', () => {
  test.each([
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Firefox on Linux',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    ['curl/8.5.0', 'curl'],
    ['', 'Unknown device'],
  ])('%s', (ua, name) => {
    expect(describeAgent(ua, english)).toBe(name);
  });

  test('says it in German too', () => {
    expect(
      describeAgent(
        'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
        german
      )
    ).toBe('Firefox auf Linux');
    expect(describeAgent('', german)).toBe('Unbekanntes Gerät');
  });

  test('a phone is mobile, a computer not', () => {
    expect(
      parseAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)')
        .mobile
    ).toBe(true);
    expect(parseAgent('Mozilla/5.0 (X11; Linux x86_64)').mobile).toBe(false);
  });
});
