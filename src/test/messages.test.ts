import {
  parse,
  TYPE,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';
import { describe, expect, test } from 'bun:test';

import { LOCALES } from '@/i18n/locales';
import en from '@/i18n/messages/en.json';

type Tree = { [key: string]: string | Tree };

/** Every message by its dotted key: "common.save" → "Save". */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') found.set(path, value);
    else for (const [k, v] of flatten(value, path)) found.set(k, v);
  }
  return found;
}

/** The arguments a message takes, however deep in its plurals and selects. */
function argumentsOf(
  elements: MessageFormatElement[],
  found = new Set<string>()
) {
  for (const el of elements) {
    if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
    if (el.type === TYPE.tag) {
      found.add(`<${el.value}>`);
      argumentsOf(el.children, found);
      continue;
    }
    found.add(el.value);
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      for (const option of Object.values(el.options)) {
        argumentsOf(option.value, found);
      }
    }
  }
  return found;
}

/** Plurals missing "other", which every language needs for the numbers it has no rule of its own for. */
function pluralsWithoutOther(elements: MessageFormatElement[]): boolean {
  return elements.some(
    (el) =>
      (el.type === TYPE.plural && !('other' in el.options)) ||
      ((el.type === TYPE.plural || el.type === TYPE.select) &&
        Object.values(el.options).some((o) => pluralsWithoutOther(o.value))) ||
      (el.type === TYPE.tag && pluralsWithoutOther(el.children))
  );
}

const english = flatten(en as Tree);

describe.each(LOCALES.filter((l) => l !== 'en'))('%s', async (locale) => {
  const messages = flatten(
    (await import(`@/i18n/messages/${locale}.json`)).default as Tree
  );

  test("has English's keys, no more and no fewer", () => {
    expect([...messages.keys()].sort()).toEqual([...english.keys()].sort());
  });

  test("takes each message's arguments as English does", () => {
    for (const [key, message] of messages) {
      const source = english.get(key);
      if (source === undefined) continue;
      expect({ key, args: [...argumentsOf(parse(message))].sort() }).toEqual({
        key,
        args: [...argumentsOf(parse(source))].sort(),
      });
    }
  });
});

describe('every language', () => {
  test('writes its plurals with an "other"', async () => {
    for (const locale of LOCALES) {
      const tree = (await import(`@/i18n/messages/${locale}.json`))
        .default as Tree;
      for (const [key, message] of flatten(tree)) {
        expect({
          locale,
          key,
          ok: !pluralsWithoutOther(parse(message)),
        }).toEqual({ locale, key, ok: true });
      }
    }
  });
});

describe('negotiateLocale', async () => {
  const { negotiateLocale } = await import('@/i18n/locales');
  test("picks the browser's first that's spoken here, by its weight", () => {
    expect(negotiateLocale('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8,de;q=0.7')).toBe('en');
    expect(negotiateLocale('en;q=0.5,de;q=0.9')).toBe('de');
  });
  test('falls back to English', () => {
    expect(negotiateLocale(undefined)).toBe('en');
    expect(negotiateLocale('fr,ja')).toBe('en');
  });
});
